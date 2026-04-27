import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { draftQueue, posts, userSettings } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";
import { calculateScheduledAt } from "@/lib/scheduler";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireAuth();
    const { id } = await params;
    const draft = await db.query.draftQueue.findFirst({ where: and(eq(draftQueue.id, id), eq(draftQueue.userId, userId), eq(draftQueue.status, "pending")) });
    if (!draft) return Response.json({ error: "Draft not found" }, { status: 404 });

    const settings = await db.query.userSettings.findFirst({ where: eq(userSettings.userId, userId) });
    if (!settings) return Response.json({ error: "Missing settings" }, { status: 400 });
    const scheduledAt = calculateScheduledAt({
      preferredTime: settings.preferredTime,
      timezone: settings.timezone,
      jitterMinutes: settings.jitterMinutes,
      preferredDays: settings.preferredDays,
    });

    await db.update(draftQueue).set({ status: "approved", scheduledFor: scheduledAt }).where(and(eq(draftQueue.id, id), eq(draftQueue.userId, userId)));
    await db.insert(posts).values({
      userId,
      draftId: id,
      contentSnapshot: draft.editedText ?? draft.draftText,
      status: "scheduled",
      scheduledAt,
    });
    return Response.json({ scheduledAt: scheduledAt.toISOString() });
  } catch (error) {
    console.error('Approve error:', error)
    return Response.json({ 
      error: "Failed to approve draft",
      detail: error instanceof Error ? error.message : String(error)
    }, { status: 400 })
  }
}
