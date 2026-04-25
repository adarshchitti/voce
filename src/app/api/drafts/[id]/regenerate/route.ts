import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { draftQueue, rejectionReasons, researchItems, voiceProfiles } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";
import { generateDraft } from "@/lib/ai/generate-draft";
import { scoreVoice } from "@/lib/ai/score-voice";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireAuth();
    const { id } = await params;
    const body = (await request.json()) as { instruction?: string };
    if (!body.instruction?.trim()) return Response.json({ error: "instruction is required" }, { status: 400 });
    const original = await db.query.draftQueue.findFirst({ where: and(eq(draftQueue.id, id), eq(draftQueue.userId, userId)) });
    if (!original || !original.researchItemId) return Response.json({ error: "Draft not found" }, { status: 404 });
    const researchItem = await db.query.researchItems.findFirst({ where: eq(researchItems.id, original.researchItemId) });
    if (!researchItem) return Response.json({ error: "Research item missing" }, { status: 400 });
    const voiceProfile = await db.query.voiceProfiles.findFirst({ where: eq(voiceProfiles.userId, userId) });
    const rejections = await db.query.rejectionReasons.findMany({ where: eq(rejectionReasons.userId, userId), orderBy: [desc(rejectionReasons.createdAt)], limit: 10 });
    const generated = await generateDraft({
      extractedPatterns: voiceProfile?.extractedPatterns ?? {},
      rawDescription: voiceProfile?.rawDescription ?? "",
      title: researchItem.title,
      summary: researchItem.summary ?? "",
      url: researchItem.url,
      rejections,
      instruction: body.instruction,
    });
    const voiceScore = voiceProfile?.calibrated ? await scoreVoice({ extractedPatterns: voiceProfile.extractedPatterns, draftText: generated.draftText }) : null;
    const [created] = await db
      .insert(draftQueue)
      .values({
        userId,
        researchItemId: original.researchItemId,
        draftText: generated.draftText,
        hook: generated.hook,
        format: generated.format,
        sourceUrls: [researchItem.url],
        voiceScore,
        status: "pending",
        staleAfter: original.staleAfter,
      })
      .returning();
    await db.update(draftQueue).set({ status: "rejected" }).where(and(eq(draftQueue.id, id), eq(draftQueue.userId, userId)));
    await db.insert(rejectionReasons).values({ userId, draftId: id, reasonCode: "other", freeText: `Regenerated: ${body.instruction}` });
    return Response.json({ draft: created });
  } catch {
    return Response.json({ error: "Failed to regenerate draft" }, { status: 400 });
  }
}
