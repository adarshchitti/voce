import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { topicSubscriptions } from "@/lib/db/schema";
import { getAuthenticatedUser } from "@/lib/auth";
import { sanitiseTavilyQuery, sanitiseTopicLabel } from "@/lib/sanitise";

export async function GET() {
  try {
    const { userId, unauthorized } = await getAuthenticatedUser();
    if (unauthorized) return unauthorized;
    const topics = await db.query.topicSubscriptions.findMany({ where: eq(topicSubscriptions.userId, userId) });
    return Response.json({ topics });
  } catch {
    return Response.json({ error: "Failed to fetch topics" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const { userId, unauthorized } = await getAuthenticatedUser();
    if (unauthorized) return unauthorized;
    const body = (await request.json()) as {
      topicLabel?: string;
      tavilyQuery?: string;
      sourceUrls?: string[];
      priorityWeight?: number;
    };
    if (body.topicLabel) {
      body.topicLabel = sanitiseTopicLabel(body.topicLabel);
    }
    if (body.tavilyQuery) {
      body.tavilyQuery = sanitiseTavilyQuery(body.tavilyQuery);
    }
    if (!body.topicLabel || !body.tavilyQuery) return Response.json({ error: "topicLabel and tavilyQuery are required" }, { status: 400 });
    const [topic] = await db
      .insert(topicSubscriptions)
      .values({
        userId,
        topicLabel: body.topicLabel,
        tavilyQuery: body.tavilyQuery,
        sourceUrls: body.sourceUrls ?? [],
        priorityWeight: body.priorityWeight ?? 3,
        active: true,
      })
      .returning();
    return Response.json({ topic });
  } catch {
    return Response.json({ error: "Failed to create topic" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { userId, unauthorized } = await getAuthenticatedUser();
    if (unauthorized) return unauthorized;
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });

    const body = (await request.json()) as {
      topicLabel?: string;
      tavilyQuery?: string;
      sourceUrls?: string[];
      priorityWeight?: number;
    };

    const updateValues: Partial<typeof topicSubscriptions.$inferInsert> = {};
    if (body.topicLabel !== undefined) updateValues.topicLabel = sanitiseTopicLabel(body.topicLabel);
    if (body.tavilyQuery !== undefined) updateValues.tavilyQuery = sanitiseTavilyQuery(body.tavilyQuery);
    if (body.sourceUrls !== undefined) updateValues.sourceUrls = body.sourceUrls;
    if (body.priorityWeight !== undefined) updateValues.priorityWeight = body.priorityWeight;

    const [topic] = await db
      .update(topicSubscriptions)
      .set(updateValues)
      .where(and(eq(topicSubscriptions.id, id), eq(topicSubscriptions.userId, userId)))
      .returning();

    if (!topic) return Response.json({ error: "Topic not found" }, { status: 404 });
    return Response.json({ topic });
  } catch {
    return Response.json({ error: "Failed to update topic" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { userId, unauthorized } = await getAuthenticatedUser();
    if (unauthorized) return unauthorized;
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    await db.delete(topicSubscriptions).where(and(eq(topicSubscriptions.id, id), eq(topicSubscriptions.userId, userId)));
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Failed to delete topic" }, { status: 400 });
  }
}
