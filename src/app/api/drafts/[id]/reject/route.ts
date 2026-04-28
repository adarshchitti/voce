import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { draftMemories, draftQueue, rejectionReasons, researchItems } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";

function inferStructure(text: string): string {
  if (text.match(/^\d+\./m)) return "numbered_list";
  if (text.match(/^[-•]/m)) return "bullet_list";
  if (text.match(/I (remember|was|learned|made|failed)/i)) return "personal_story";
  if (text.match(/\d+%|\d+ (out of|people|companies)/i)) return "data_point_hook";
  if (text.match(/\?/)) return "question_hook";
  return "direct_statement";
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireAuth();
    const { id } = await params;
    const body = (await request.json()) as { reasonCode?: string; freeText?: string };
    if (!body.reasonCode) return Response.json({ error: "reasonCode is required" }, { status: 400 });
    const voiceReasonCodes = [
      "too_formal", "too_casual", "too_listy", "too_long",
      "too_short", "sounds_like_ai", "wrong_execution", "wrong_tone",
    ];
    const researchReasonCodes = ["wrong_topic", "not_interesting", "factually_off"];
    const rejectionType =
      voiceReasonCodes.includes(body.reasonCode) ? "voice" :
      researchReasonCodes.includes(body.reasonCode) ? "research" :
      "other";
    const draft = await db.query.draftQueue.findFirst({ where: and(eq(draftQueue.id, id), eq(draftQueue.userId, userId)) });
    if (!draft) return Response.json({ error: "Draft not found" }, { status: 404 });
    await db.update(draftQueue).set({ status: "rejected" }).where(and(eq(draftQueue.id, id), eq(draftQueue.userId, userId)));
    await db.insert(rejectionReasons).values({ userId, draftId: id, reasonCode: body.reasonCode, freeText: body.freeText, rejectionType });
    const researchItem = draft.researchItemId
      ? await db.query.researchItems.findFirst({ where: eq(researchItems.id, draft.researchItemId) })
      : null;
    await db.insert(draftMemories).values({
      userId: draft.userId,
      draftId: draft.id,
      topicCluster: researchItem?.sourceType ?? null,
      structureUsed: inferStructure(draft.draftText),
      approved: false,
      hookFirstLine: draft.draftText.split("\n")[0]?.slice(0, 200) ?? "",
      wordCount: draft.draftText.split(/\s+/).filter(Boolean).length,
      editDiffSummary: null,
      editDepthPct: 0,
    });
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Failed to reject draft" }, { status: 400 });
  }
}
