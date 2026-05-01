import { and, eq, gt, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { cronRuns, researchItems, topicSubscriptions } from "@/lib/db/schema";
import { scoreResearchItem } from "@/lib/ai/score-research";
import { fetchRssItems } from "@/lib/research/rss";
import { fetchTavilyItems } from "@/lib/research/tavily";

export type ResearchPipelineResult = {
  fetched: number;
  deduplicated: number;
  inserted: number;
  errors: number;
};

export async function runResearchPipeline(): Promise<ResearchPipelineResult> {
  const activeSubs = await db
    .select()
    .from(topicSubscriptions)
    .where(eq(topicSubscriptions.active, true));
  const uniqueQueries = [...new Set(activeSubs.map((s) => s.tavilyQuery))];
  const rssUrls = [...new Set(activeSubs.flatMap((s) => s.sourceUrls ?? []))];
  const topicsList = [...new Set(activeSubs.map((s) => s.topicLabel))].join(", ");
  const rawItems = [];
  let errors = 0;

  for (const query of uniqueQueries) {
    try {
      rawItems.push(...(await fetchTavilyItems(query, "news")));
      rawItems.push(...(await fetchTavilyItems(query, "search")));
    } catch (err) {
      errors += 1;
      console.error("Research fetch failed:", err instanceof Error ? err.message : String(err));
    }
  }

  for (const url of rssUrls) {
    try {
      rawItems.push(...(await fetchRssItems(url)));
    } catch (err) {
      errors += 1;
      console.error("RSS fetch failed:", err instanceof Error ? err.message : String(err));
    }
  }

  const dedupHashes = rawItems.map((i) => i.dedupHash);
  const existing = dedupHashes.length
    ? await db
        .select({ dedupHash: researchItems.dedupHash })
        .from(researchItems)
        .where(
          and(
            inArray(researchItems.dedupHash, dedupHashes),
            gt(researchItems.fetchedAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
          ),
        )
    : [];
  const existingSet = new Set(existing.map((e) => e.dedupHash));
  let inserted = 0;
  let deduplicated = 0;

  for (const item of rawItems) {
    if (existingSet.has(item.dedupHash)) {
      deduplicated += 1;
      continue;
    }

    try {
      const score = await scoreResearchItem({
        topicsList,
        title: item.title,
        summary: item.summary,
        publishedAt: item.publishedAt?.toISOString() ?? "unknown",
      });
      await db
        .insert(researchItems)
        .values({
          url: item.url,
          title: item.title,
          summary: item.summary,
          sourceType: item.sourceType,
          publishedAt: item.publishedAt,
          dedupHash: item.dedupHash,
          relevanceScore: String(score.relevance),
          originalityScore: String(score.originality),
        })
        .onConflictDoNothing();
      inserted += 1;
    } catch (err) {
      errors += 1;
      console.error("Research insert failed:", err instanceof Error ? err.message : String(err));
    }
  }

  return { fetched: rawItems.length, deduplicated, inserted, errors };
}

export async function logResearchRun(startTime: number, result: ResearchPipelineResult) {
  await db
    .insert(cronRuns)
    .values({
      phase: "research",
      durationMs: Date.now() - startTime,
      result,
      errorCount: result.errors,
      success: result.errors === 0 || result.inserted > 0,
    })
    .catch((err) => {
      console.error("Failed to log cron run:", err);
    });
}
