import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { draftQueue, rejectionReasons, researchItems, voiceProfiles } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";
import { generateDraft } from "@/lib/ai/generate-draft";
import { scanDraftForAITells } from "@/lib/ai/scan-draft";
import { scoreVoice } from "@/lib/ai/score-voice";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await request.text();
    const userId = await requireAuth();
    const { id } = await params;

    const draft = await db.query.draftQueue.findFirst({
      where: and(eq(draftQueue.id, id), eq(draftQueue.userId, userId)),
    });

    if (!draft) {
      return Response.json({ error: "Draft not found" }, { status: 404 });
    }

    const [voiceProfile, recentRejections, researchItem] = await Promise.all([
      db.query.voiceProfiles.findFirst({
        where: eq(voiceProfiles.userId, userId),
      }),
      db
        .select()
        .from(rejectionReasons)
        .where(eq(rejectionReasons.userId, userId))
        .orderBy(desc(rejectionReasons.createdAt))
        .limit(10),
      draft.researchItemId
        ? db.query.researchItems.findFirst({
            where: eq(researchItems.id, draft.researchItemId),
          })
        : null,
    ]);

    const personalInstruction = `
Add a genuine personal angle to this post. The author is:
- A junior CS student at Virginia Tech doing agentic AI research
- Interning at Klaviyo this summer (marketing automation / data infrastructure)
- Currently building and researching coding agents

Connect the topic naturally to one of these experiences where it honestly fits.
Do not force it if the connection is not genuine. If the topic relates to
agent design, system tradeoffs, or production vs research — those are
natural connection points. Keep the post the same length. Do not add
"as someone who..." or similar awkward transitions.
`.trim();

    const result = await generateDraft({
      sentenceLength: voiceProfile?.sentenceLength,
      hookStyle: voiceProfile?.hookStyle,
      pov: voiceProfile?.pov,
      toneMarkers: voiceProfile?.toneMarkers,
      formattingStyle: voiceProfile?.formattingStyle,
      userBannedWords: voiceProfile?.userBannedWords,
      userNotes: voiceProfile?.userNotes,
      extractedPatterns: voiceProfile?.extractedPatterns,
      rawDescription: voiceProfile?.rawDescription ?? "",
      title: researchItem?.title ?? "Article",
      summary: researchItem?.summary ?? "",
      url: researchItem?.url ?? "",
      rejections: recentRejections.map((reason) => ({
        reasonCode: reason.reasonCode,
        freeText: reason.freeText,
      })),
      instruction: personalInstruction,
    });

    const [scanResult, voiceScore] = await Promise.all([
      scanDraftForAITells(result.draftText),
      voiceProfile?.calibrated && voiceProfile.extractedPatterns
        ? scoreVoice({ draftText: result.draftText, extractedPatterns: voiceProfile.extractedPatterns })
        : Promise.resolve(null),
    ]);

    await db
      .update(draftQueue)
      .set({
        draftText: result.draftText,
        hook: result.hook,
        voiceScore,
        editedText: null,
        aiTellFlags: scanResult.clean
          ? null
          : JSON.stringify({
              words: scanResult.flaggedWords,
              structure: scanResult.structureIssues,
            }),
      })
      .where(and(eq(draftQueue.id, id), eq(draftQueue.userId, userId)));

    const updated = await db.query.draftQueue.findFirst({
      where: and(eq(draftQueue.id, id), eq(draftQueue.userId, userId)),
    });

    return Response.json(updated);
  } catch (error) {
    console.error("Personalize failed:", error);
    return Response.json({ error: "Failed to personalize draft" }, { status: 500 });
  }
}
