import { and, count, desc, eq, inArray, max } from "drizzle-orm";
import { db } from "@/lib/db";
import { contentSeries, draftQueue, posts, seriesTopicSubscriptions, topicSubscriptions } from "@/lib/db/schema";

export type ProjectLinkedTopic = {
  topicSubscriptionId: string;
  topicLabel: string;
  priorityWeight: number;
};

export async function getProjectLinkedTopics(seriesId: string, userId: string): Promise<ProjectLinkedTopic[]> {
  const rows = await db
    .select({
      topicSubscriptionId: seriesTopicSubscriptions.topicSubscriptionId,
      topicLabel: topicSubscriptions.topicLabel,
      priorityWeight: seriesTopicSubscriptions.priorityWeight,
    })
    .from(seriesTopicSubscriptions)
    .innerJoin(topicSubscriptions, eq(seriesTopicSubscriptions.topicSubscriptionId, topicSubscriptions.id))
    .innerJoin(contentSeries, eq(seriesTopicSubscriptions.seriesId, contentSeries.id))
    .where(and(eq(seriesTopicSubscriptions.seriesId, seriesId), eq(contentSeries.userId, userId)));

  return rows;
}

export async function getProjectPostStats(seriesIds: string[], userId: string) {
  if (!seriesIds.length) return new Map<string, { postsPublished: number; lastPublishedAt: Date | null }>();
  const counts = await db
    .select({
      seriesId: posts.seriesId,
      postsPublished: count(posts.id),
      lastPublishedAt: max(posts.publishedAt),
    })
    .from(posts)
    .innerJoin(contentSeries, eq(posts.seriesId, contentSeries.id))
    .where(and(inArray(posts.seriesId, seriesIds), eq(contentSeries.userId, userId)))
    .groupBy(posts.seriesId);

  return new Map(
    counts
      .filter((row): row is { seriesId: string; postsPublished: number; lastPublishedAt: Date | null } => Boolean(row.seriesId))
      .map((row) => [row.seriesId, { postsPublished: Number(row.postsPublished), lastPublishedAt: row.lastPublishedAt }]),
  );
}

export async function getRecentProjectPosts(seriesId: string, userId: string) {
  return db
    .select({
      id: posts.id,
      contentSnapshot: posts.contentSnapshot,
      status: posts.status,
      publishedAt: posts.publishedAt,
      scheduledAt: posts.scheduledAt,
      voiceScore: draftQueue.voiceScore,
    })
    .from(posts)
    .leftJoin(draftQueue, eq(posts.draftId, draftQueue.id))
    .innerJoin(contentSeries, eq(posts.seriesId, contentSeries.id))
    .where(and(eq(posts.seriesId, seriesId), eq(contentSeries.userId, userId)))
    .orderBy(desc(posts.scheduledAt))
    .limit(10);
}

