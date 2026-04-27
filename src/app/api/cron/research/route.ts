import { and, eq, gt, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { cronRuns, researchItems, topicSubscriptions } from "@/lib/db/schema";
import { fetchTavilyItems } from "@/lib/research/tavily";
import { fetchRssItems } from "@/lib/research/rss";
import { scoreResearchItem } from "@/lib/ai/score-research";
import { getCronSecret } from "@/lib/linkedin/oauth";

export const GET = POST;

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${getCronSecret()}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const startTime = Date.now();
    const activeSubs = await db.select().from(topicSubscriptions).where(eq(topicSubscriptions.active, true));
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
        console.error("Insert failed:", err instanceof Error ? err.message : String(err))
      }
    }
    for (const url of rssUrls) rawItems.push(...(await fetchRssItems(url)));

    const dedupHashes = rawItems.map((i) => i.dedupHash);
    const existing = dedupHashes.length
      ? await db
          .select({ dedupHash: researchItems.dedupHash })
          .from(researchItems)
          .where(and(inArray(researchItems.dedupHash, dedupHashes), gt(researchItems.fetchedAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))))
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
        await db.insert(researchItems).values({
          url: item.url,
          title: item.title,
          summary: item.summary,
          sourceType: item.sourceType,
          publishedAt: item.publishedAt,
          dedupHash: item.dedupHash,
          relevanceScore: String(score.relevance),
          originalityScore: String(score.originality),
        }).onConflictDoNothing();
        inserted += 1;
      } catch (err) {
        errors += 1;
        console.error("Insert failed:", err instanceof Error ? err.message : String(err))
      }
    }

    const result = { fetched: rawItems.length, deduplicated, inserted, errors };
    await db
      .insert(cronRuns)
      .values({
        phase: "research",
        durationMs: Date.now() - startTime,
        result,
        errorCount: errors,
        success: errors === 0 || inserted > 0,
      })
      .catch((err) => {
        console.error("Failed to log cron run:", err);
      });
    return Response.json(result);
  } catch {
    return Response.json({ error: "Research cron failed" }, { status: 400 });
  }
}
