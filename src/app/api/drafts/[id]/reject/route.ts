import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { draftQueue, rejectionReasons } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireAuth();
    const { id } = await params;
    const body = (await request.json()) as { reasonCode?: string; freeText?: string };
    if (!body.reasonCode) return Response.json({ error: "reasonCode is required" }, { status: 400 });
    const draft = await db.query.draftQueue.findFirst({ where: and(eq(draftQueue.id, id), eq(draftQueue.userId, userId)) });
    if (!draft) return Response.json({ error: "Draft not found" }, { status: 404 });
    await db.update(draftQueue).set({ status: "rejected" }).where(and(eq(draftQueue.id, id), eq(draftQueue.userId, userId)));
    await db.insert(rejectionReasons).values({ userId, draftId: id, reasonCode: body.reasonCode, freeText: body.freeText });
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Failed to reject draft" }, { status: 400 });
  }
}
