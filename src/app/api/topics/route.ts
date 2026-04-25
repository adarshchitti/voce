import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { topicSubscriptions } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  try {
    const userId = await requireAuth();
    const topics = await db.query.topicSubscriptions.findMany({ where: eq(topicSubscriptions.userId, userId) });
    return Response.json({ topics });
  } catch {
    return Response.json({ error: "Failed to fetch topics" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireAuth();
    const body = (await request.json()) as { topicLabel?: string; tavilyQuery?: string; sourceUrls?: string[] };
    if (!body.topicLabel || !body.tavilyQuery) return Response.json({ error: "topicLabel and tavilyQuery are required" }, { status: 400 });
    const [topic] = await db.insert(topicSubscriptions).values({ userId, topicLabel: body.topicLabel, tavilyQuery: body.tavilyQuery, sourceUrls: body.sourceUrls ?? [], active: true }).returning();
    return Response.json({ topic });
  } catch {
    return Response.json({ error: "Failed to create topic" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const userId = await requireAuth();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    await db.delete(topicSubscriptions).where(and(eq(topicSubscriptions.id, id), eq(topicSubscriptions.userId, userId)));
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Failed to delete topic" }, { status: 400 });
  }
}
