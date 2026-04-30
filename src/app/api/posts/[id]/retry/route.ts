import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { posts, draftQueue, linkedinTokens } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { USER_ID } from "@/lib/constants";
import { publishToLinkedIn } from "@/lib/linkedin/publish";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    void request;

    const post = await db
      .select()
      .from(posts)
      .where(and(eq(posts.id, id), eq(posts.userId, USER_ID)))
      .limit(1)
      .then((r) => r[0] ?? null);

    if (!post) {
      return Response.json({ error: "Post not found" }, { status: 404 });
    }

    if (post.status === "published") {
      return Response.json({ error: "Post already published" }, { status: 400 });
    }

    const token = await db.query.linkedinTokens.findFirst({
      where: eq(linkedinTokens.userId, USER_ID),
    });

    if (!token || token.status !== "active") {
      return Response.json(
        {
          error: "LinkedIn token expired. Please reconnect in Settings.",
        },
        { status: 400 },
      );
    }

    // Reset to publishing state
    await db.update(posts).set({ status: "publishing", failureReason: null }).where(eq(posts.id, id));

    const result = await publishToLinkedIn({
      accessToken: token.accessToken,
      personUrn: token.personUrn,
      text: post.contentSnapshot,
    });

    if (!result.success) {
      await db
        .update(posts)
        .set({
          status: "failed",
          failureReason: result.error,
        })
        .where(eq(posts.id, id));
      return Response.json({ error: result.error }, { status: 500 });
    }

    await db
      .update(posts)
      .set({
        status: "published",
        linkedinPostId: result.postId,
        publishedAt: new Date(),
        failureReason: null,
      })
      .where(eq(posts.id, id));

    await db.update(draftQueue).set({ status: "published" }).where(eq(draftQueue.id, post.draftId));

    return Response.json({ ok: true, postId: result.postId });
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
