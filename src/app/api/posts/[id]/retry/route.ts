import { isDemo } from "@/lib/demo/mode";
import { retryDemoPost } from "@/lib/demo/workspace";
import { NextRequest } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { posts } from "@/lib/db/schema";
import { getAuthenticatedUser } from "@/lib/auth";
import { runPublishForPost, type ClaimedPost } from "@/lib/pipeline/publish";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isDemo()) {
    const { id } = await params;
    const post = retryDemoPost(id);
    if (!post) return Response.json({ error: "Post is not in failed state" }, { status: 409 });
    return Response.json({ ok: true, postId: post.id });
  }
  try {
    const { id } = await params;
    void request;
    const { userId, unauthorized } = await getAuthenticatedUser();
    if (unauthorized) return unauthorized;

    const claimed = await db
      .update(posts)
      .set({
        status: "publishing",
        claimedAt: new Date(),
        attempts: sql`${posts.attempts} + 1`,
        failureReason: null,
      })
      .where(
        and(
          eq(posts.id, id),
          eq(posts.userId, userId),
          eq(posts.status, "failed"),
        ),
      )
      .returning();

    if (claimed.length === 0) {
      return Response.json(
        { error: "Post is not in failed state" },
        { status: 409 },
      );
    }

    const row = claimed[0];
    const claimedPost: ClaimedPost = {
      id: row.id,
      userId: row.userId,
      draftId: row.draftId,
      contentSnapshot: row.contentSnapshot,
      linkedinPostId: row.linkedinPostId,
      scheduledAt: row.scheduledAt,
      attempts: row.attempts,
    };

    const result = await runPublishForPost(claimedPost, userId);

    if (result.success) {
      return Response.json({ ok: true, postId: result.postId });
    }
    return Response.json(
      { error: result.reason ?? "publish failed" },
      { status: 500 },
    );
  } catch (error) {
    console.error("Retry failed:", error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Retry failed",
      },
      { status: 500 },
    );
  }
}
