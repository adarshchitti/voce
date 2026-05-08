import { and, eq } from "drizzle-orm";
import { getAuthenticatedUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { posts } from "@/lib/db/schema";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, unauthorized } = await getAuthenticatedUser();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const body = await request.json().catch(() => ({} as { scheduledAt?: string }));
  if (!body.scheduledAt) {
    return Response.json({ error: "scheduledAt required" }, { status: 400 });
  }

  const newScheduledAt = new Date(body.scheduledAt);
  if (Number.isNaN(newScheduledAt.getTime())) {
    return Response.json({ error: "Invalid date" }, { status: 400 });
  }

  const post = await db
    .select()
    .from(posts)
    .where(and(eq(posts.id, id), eq(posts.userId, userId)))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!post) {
    return Response.json({ error: "Post not found" }, { status: 404 });
  }

  if (post.status !== "scheduled") {
    return Response.json({ error: "Only scheduled posts can be rescheduled" }, { status: 400 });
  }

  await db
    .update(posts)
    .set({ scheduledAt: newScheduledAt })
    .where(eq(posts.id, id));

  return Response.json({ success: true, scheduledAt: newScheduledAt.toISOString() });
}
