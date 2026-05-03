// Diagnostic: call the Haiku judge directly with the same recency-filtered
// candidate pool a daily cron run would see, and report verdicts.
// Does not write anything. Uses a 60s timeout to remove timing pressure.
import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

const userId = process.argv[2];
if (!userId) {
  console.error("Usage: tsx scripts/probe-judge.mts <userId>");
  process.exit(1);
}

const { db } = await import("../src/lib/db/index");
const { researchItems, topicSubscriptions } = await import("../src/lib/db/schema");
const { judgeResearchForUser, JUDGE_RELEVANCE_THRESHOLD } = await import("../src/lib/ai/judge-research");
const { getPriorityMultiplier } = await import("../src/lib/ai/rank-research");
const { and, desc, eq, gt, sql } = await import("drizzle-orm");

const subs = await db
  .select()
  .from(topicSubscriptions)
  .where(and(eq(topicSubscriptions.userId, userId), eq(topicSubscriptions.active, true)));

const recencyCutoff = sql`now() - interval '72 hours'`;
const candidates = await db
  .select()
  .from(researchItems)
  .where(gt(researchItems.publishedAt, recencyCutoff))
  .orderBy(
    desc(sql`coalesce(${researchItems.relevanceScore}, 0) + coalesce(${researchItems.originalityScore}, 0)`),
  )
  .limit(30);

console.log(`User ${userId}: ${candidates.length} candidates, ${subs.length} active topics.`);

const start = Date.now();
const judged = await judgeResearchForUser(
  {
    candidates: candidates.map((c) => ({
      id: c.id,
      title: c.title,
      summary: c.summary ?? "",
      published_at: c.publishedAt ? c.publishedAt.toISOString() : "",
    })),
    userTopics: subs.map((s) => ({
      id: s.id,
      topic_label: s.topicLabel,
      tavily_query: s.tavilyQuery,
    })),
  },
  { timeoutMs: 60000 },
);

console.log(`\nJudge took ${Date.now() - start}ms; ok=${judged.ok}`);
if (!judged.ok) {
  console.log(`Judge failed: ${judged.reason}`);
  process.exit(1);
}

const subsById = new Map(subs.map((s) => [s.id, s]));
const ranked = judged.verdicts
  .filter((v) => v.relevance >= JUDGE_RELEVANCE_THRESHOLD)
  .map((v) => {
    const sub = v.matched_topic_id ? subsById.get(v.matched_topic_id) : undefined;
    const item = candidates.find((c) => c.id === v.research_item_id)!;
    const multiplier = getPriorityMultiplier(sub?.priorityWeight);
    return {
      title: item.title.slice(0, 60),
      published: item.publishedAt?.toISOString().slice(0, 10),
      relevance: v.relevance,
      topic: sub?.topicLabel ?? "(none)",
      priority: sub?.priorityWeight ?? "-",
      multiplier,
      finalScore: Number((v.relevance * multiplier).toFixed(3)),
      reason: v.reason,
    };
  })
  .sort((a, b) => b.finalScore - a.finalScore);

console.log(`\n${judged.verdicts.length} verdicts, ${ranked.length} pass threshold ${JUDGE_RELEVANCE_THRESHOLD}.`);
console.log(`\nTop 6 by final_score (relevance × priority multiplier):`);
for (const r of ranked.slice(0, 6)) {
  console.log(
    `  ${r.finalScore.toFixed(2)}  rel=${r.relevance.toFixed(2)} × p${r.priority}=${r.multiplier}  topic=[${r.topic}]  ${r.published}`,
  );
  console.log(`    ${r.title}`);
  console.log(`    └─ ${r.reason}`);
}

console.log(`\n--- Items dropped below threshold: ${judged.verdicts.length - ranked.length} ---`);
const dropped = judged.verdicts
  .filter((v) => v.relevance < JUDGE_RELEVANCE_THRESHOLD)
  .slice(0, 5);
for (const v of dropped) {
  const item = candidates.find((c) => c.id === v.research_item_id)!;
  console.log(`  rel=${v.relevance.toFixed(2)}  ${item.title.slice(0, 70)}`);
}

process.exit(0);
