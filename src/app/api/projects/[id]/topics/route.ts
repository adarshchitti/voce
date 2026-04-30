import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { contentSeries, seriesTopicSubscriptions, topicSubscriptions } from "@/lib/db/schema";
import { getAuthenticatedUser } from "@/lib/auth";

type AddTopicBody = { topicSubscriptionId?: string; priorityWeight?: number };
type RemoveTopicBody = { topicSubscriptionId?: string };

async function ensureProjectOwner(seriesId: string, userId: string) {
  const project = await db.query.contentSeries.findFirst({
    where: and(eq(contentSeries.id, seriesId), eq(contentSeries.userId, userId)),
  });
  return Boolean(project);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, unauthorized } = await getAuthenticatedUser();
    if (unauthorized) return unauthorized;
    const { id } = await params;
    const body = (await request.json()) as AddTopicBody;
    if (!body.topicSubscriptionId || typeof body.priorityWeight !== "number") {
      return Response.json({ error: "topicSubscriptionId and priorityWeight are required" }, { status: 400 });
    }
    const [isOwner, topic] = await Promise.all([
      ensureProjectOwner(id, userId),
      db.query.topicSubscriptions.findFirst({
        where: and(eq(topicSubscriptions.id, body.topicSubscriptionId), eq(topicSubscriptions.userId, userId)),
      }),
    ]);
    if (!isOwner || !topic) return Response.json({ error: "Not found" }, { status: 404 });
    const priorityWeight = Math.min(5, Math.max(1, body.priorityWeight));
    await db
      .insert(seriesTopicSubscriptions)
      .values({
        seriesId: id,
        topicSubscriptionId: body.topicSubscriptionId,
        priorityWeight,
      })
      .onConflictDoUpdate({
        target: [seriesTopicSubscriptions.seriesId, seriesTopicSubscriptions.topicSubscriptionId],
        set: { priorityWeight },
      });
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Failed to link topic" }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, unauthorized } = await getAuthenticatedUser();
    if (unauthorized) return unauthorized;
    const { id } = await params;
    const body = (await request.json()) as RemoveTopicBody;
    if (!body.topicSubscriptionId) {
      return Response.json({ error: "topicSubscriptionId is required" }, { status: 400 });
    }
    const isOwner = await ensureProjectOwner(id, userId);
    if (!isOwner) return Response.json({ error: "Not found" }, { status: 404 });
    await db
      .delete(seriesTopicSubscriptions)
      .where(and(eq(seriesTopicSubscriptions.seriesId, id), eq(seriesTopicSubscriptions.topicSubscriptionId, body.topicSubscriptionId)));
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Failed to unlink topic" }, { status: 400 });
  }
}

