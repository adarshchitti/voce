import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { contentSeries, draftQueue, posts } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  try {
    const userId = await requireAuth();
    const data = await db
      .select({
        id: posts.id,
        status: posts.status,
        contentSnapshot: posts.contentSnapshot,
        scheduledAt: posts.scheduledAt,
        publishedAt: posts.publishedAt,
        failureReason: posts.failureReason,
        linkedinPostId: posts.linkedinPostId,
        manualImpressions: posts.manualImpressions,
        manualReactions: posts.manualReactions,
        manualComments: posts.manualComments,
        seriesId: posts.seriesId,
        seriesPosition: posts.seriesPosition,
        draftId: posts.draftId,
        voiceScore: draftQueue.voiceScore,
        seriesTitle: contentSeries.title,
      })
      .from(posts)
      .leftJoin(draftQueue, eq(posts.draftId, draftQueue.id))
      .leftJoin(contentSeries, eq(posts.seriesId, contentSeries.id))
      .where(eq(posts.userId, userId))
      .orderBy(desc(posts.scheduledAt))
      .limit(100);
    return Response.json({ posts: data });
  } catch {
    return Response.json({ error: "Failed to fetch posts" }, { status: 400 });
  }
}
