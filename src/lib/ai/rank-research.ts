import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { contentSeries, seriesTopicSubscriptions } from "@/lib/db/schema";

const PRIORITY_MULTIPLIERS: Record<number, number> = {
  1: 0.6,
  2: 0.8,
  3: 1.0,
  4: 1.2,
  5: 1.5,
};

export function getPriorityMultiplier(weight: number | null | undefined): number {
  const safeWeight = weight ?? 3;
  return PRIORITY_MULTIPLIERS[safeWeight] ?? 1.0;
}

export function getPriorityAdjustedScore(input: {
  relevanceScore: number | null | undefined;
  originalityScore: number | null | undefined;
  topicPriorityWeight: number | null | undefined;
}): number {
  const base = (input.relevanceScore ?? 0) + (input.originalityScore ?? 0);
  return base * getPriorityMultiplier(input.topicPriorityWeight);
}

/**
 * Token-overlap matcher used by the project-only "Generate Now" route.
 * Returns the highest priority weight across all topics that match the
 * item's title/summary, or 3 (default) if no topic matched.
 *
 * Phase 2 fix: previously initialised `best = 3` and only took Math.max,
 * which made priority 1 and 2 unreachable (Math.max(3, 1) === 3). Now
 * starts null and only falls back to 3 when no topic matched at all.
 */
export function getMatchedPriorityWeight(input: {
  title: string;
  summary: string | null;
  linkedTopics: Array<{ topicLabel: string; priorityWeight: number }>;
}): number {
  const haystack = `${input.title} ${input.summary ?? ""}`.toLowerCase();
  let best: number | null = null;
  for (const topic of input.linkedTopics) {
    const matched = topic.topicLabel
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .some((token) => token.length > 2 && haystack.includes(token));
    if (matched) {
      best = best === null ? topic.priorityWeight : Math.max(best, topic.priorityWeight);
    }
  }
  return best ?? 3;
}

/**
 * Pure helper for project-junction priority composition. Given the set
 * of priority weights from every project that this topic belongs to,
 * returns the multiplier for the maximum weight (or 1.0 if empty).
 * Extracted so the logic can be unit-tested without a live DB.
 */
export function selectProjectMultiplierFromWeights(weights: Array<number | null | undefined>): number {
  const valid = weights.filter((w): w is number => typeof w === "number");
  if (valid.length === 0) return 1.0;
  return getPriorityMultiplier(Math.max(...valid));
}

/**
 * Phase 2: returns the project-junction multiplier for a (user, topic) pair.
 * Joins series_topic_subscriptions to content_series so we only count
 * priorities from projects this user actually owns and that are active.
 * Returns 1.0 if the topic isn't linked to any active project.
 */
export async function computeProjectMultiplier(userId: string, topicId: string): Promise<number> {
  const links = await db
    .select({ priorityWeight: seriesTopicSubscriptions.priorityWeight })
    .from(seriesTopicSubscriptions)
    .innerJoin(contentSeries, eq(seriesTopicSubscriptions.seriesId, contentSeries.id))
    .where(
      and(
        eq(seriesTopicSubscriptions.topicSubscriptionId, topicId),
        eq(contentSeries.userId, userId),
        eq(contentSeries.status, "active"),
      ),
    );
  return selectProjectMultiplierFromWeights(links.map((l) => l.priorityWeight));
}
