import { isDemo } from "@/lib/demo/mode";
import { demoDrafts } from "@/lib/demo/drafts";
import { getDemoPost, removeDemoPost } from "@/lib/demo/workspace";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { posts, draftQueue } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthenticatedUser } from "@/lib/auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: postId } = await params;
  void request;

  if (isDemo()) {
    const post = getDemoPost(postId);
    if (!post) return Response.json({ error: "Post not found" }, { status: 404 });
    if (post.status === "published") {
      return Response.json({ error: "Cannot move a published post back to inbox" }, { status: 400 });
    }
    // Put the originating draft back in the inbox when it is one the demo drafts store minted.
    const draft = demoDrafts.list("approved", 500).drafts.find((d) => d.id === post.draftId);
    if (draft) draft.status = "pending";
    removeDemoPost(postId);
    return Response.json({ success: true, draftId: post.draftId });
  }

  const { userId, unauthorized } = await getAuthenticatedUser();
  if (unauthorized) return unauthorized;

  const post = await db
    .select()
    .from(posts)
    .where(and(eq(posts.id, postId), eq(posts.userId, userId)))
    .limit(1)
    .then((r) => r[0] ?? null);

  if (!post) {
    return Response.json({ error: "Post not found" }, { status: 404 });
  }

  if (post.status === "published") {
    return Response.json(
      { error: "Cannot move a published post back to inbox" },
      { status: 400 },
    );
  }

  if (!post.draftId) {
    return Response.json(
      { error: "No draft associated with this post" },
      { status: 400 },
    );
  }

  await db
    .update(draftQueue)
    .set({
      status: "pending",
      scheduledFor: null,
    })
    .where(eq(draftQueue.id, post.draftId));

  await db.delete(posts).where(eq(posts.id, postId));

  return Response.json({ success: true, draftId: post.draftId });
}

