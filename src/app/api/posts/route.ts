import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { posts } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  try {
    const userId = await requireAuth();
    const data = await db.select().from(posts).where(and(eq(posts.userId, userId))).orderBy(desc(posts.scheduledAt)).limit(50);
    return Response.json({ posts: data });
  } catch {
    return Response.json({ error: "Failed to fetch posts" }, { status: 400 });
  }
}
