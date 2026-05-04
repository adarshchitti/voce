import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { draftMemories, draftQueue, rejectionReasons, researchItems, userSettings, voiceProfiles } from "@/lib/db/schema";
import { getAuthenticatedUser } from "@/lib/auth";
import { generateDraft } from "@/lib/ai/generate-draft";
import { selectStructureTemplate } from "@/lib/ai/structure-templates";
import type { RuleContext } from "@/lib/ai/quality-rules";
import { buildAiTellFlagsJson, scanDraftForAITells } from "@/lib/ai/scan-draft";
import { scoreVoiceDetailed } from "@/lib/ai/score-voice";
import { FIELD_LIMITS, sanitiseShortText } from "@/lib/sanitise";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await request.text();
    const { userId, unauthorized } = await getAuthenticatedUser();
    if (unauthorized) return unauthorized;
    const { id } = await params;

    const draft = await db.query.draftQueue.findFirst({
      where: and(eq(draftQueue.id, id), eq(draftQueue.userId, userId)),
    });

    if (!draft) {
      return Response.json({ error: "Draft not found" }, { status: 404 });
    }

    const [voiceProfile, recentRejections, researchItem, settings] = await Promise.all([
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
      db.query.userSettings.findFirst({ where: eq(userSettings.userId, userId) }),
    ]);

    const personalContext = voiceProfile?.personalContext;
    if (!personalContext) {
      return Response.json(
        {
          error: "No personal context set. Add your background in Settings -> Voice Profile.",
        },
        { status: 400 },
      );
    }

    const safePersonalContext = sanitiseShortText(personalContext, FIELD_LIMITS.personalContext);
    const personalInstruction = `
Add a genuine personal angle to this post using the author's background below.

AUTHOR BACKGROUND:
${safePersonalContext}

Rules:
- Only connect to experiences that genuinely relate to the topic
- Do not force a connection if one does not exist naturally
- Do not use "as someone who..." or similar awkward transitions
- Keep the post the same approximate length
- The personal element should feel earned, not tacked on
`.trim();

    const structureTemplate = await selectStructureTemplate(userId);
    const topicCluster = researchItem?.sourceType ?? "general";
    const relevantMemories = await db
      .select({
        hookFirstLine: draftMemories.hookFirstLine,
        structureUsed: draftMemories.structureUsed,
        wordCount: draftMemories.wordCount,
      })
      .from(draftMemories)
      .where(
        and(
          eq(draftMemories.userId, userId),
          eq(draftMemories.approved, true),
          eq(draftMemories.topicCluster, topicCluster),
        ),
      )
      .orderBy(desc(draftMemories.createdAt))
      .limit(5);

    const result = await generateDraft({
      sentenceLength: voiceProfile?.sentenceLength,
      hookStyle: voiceProfile?.hookStyle,
      pov: voiceProfile?.pov,
      toneMarkers: voiceProfile?.toneMarkers,
      formattingStyle: voiceProfile?.formattingStyle,
      paragraphStyle: voiceProfile?.paragraphStyle,
      postStructureTemplate: voiceProfile?.postStructureTemplate,
      signaturePhrases: voiceProfile?.signaturePhrases,
      generationGuidance: voiceProfile?.generationGuidance,
      emojiContexts: voiceProfile?.emojiContexts,
      emojiExamples: voiceProfile?.emojiExamples,
      emojiNeverOverride: voiceProfile?.emojiNeverOverride,
      emojiFrequency: (voiceProfile?.extractedPatterns as { emojiFrequency?: string } | null)?.emojiFrequency ?? null,
      tellFlagEmDash: settings?.tellFlagEmDash ?? true,
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
        rejectionType: reason.rejectionType,
      })),
      instruction: personalInstruction,
      structureTemplate,
      relevantMemories,
      rulesManifest: null,
    });

    const scanContext: RuleContext = {
      userBannedWords: voiceProfile?.userBannedWords ?? null,
      userNotes: voiceProfile?.userNotes ?? null,
      tellFlagEmDash: settings?.tellFlagEmDash ?? true,
      tellFlagEngagementBeg: settings?.tellFlagEngagementBeg ?? true,
      tellFlagBannedWords: settings?.tellFlagBannedWords ?? true,
      tellFlagNumberedLists: (settings?.tellFlagNumberedLists ?? "three_plus") as
        | "always"
        | "three_plus"
        | "never",
      tellFlagEveryLine: settings?.tellFlagEveryLine ?? true,
      emojiFrequency:
        (voiceProfile?.extractedPatterns as { emojiFrequency?: string } | null)?.emojiFrequency ?? null,
    };
    const scanResult = scanDraftForAITells(result.draftText, scanContext, {
      recentMemories: relevantMemories,
    });
    const voiceResult =
      voiceProfile?.calibrated && voiceProfile.extractedPatterns
        ? await scoreVoiceDetailed({ draftText: scanResult.draftText, voiceProfile })
        : null;

    const voiceScore = voiceResult?.score ?? null;
    const voiceFlags = voiceResult?.flags ?? [];

    await db
      .update(draftQueue)
      .set({
        draftText: scanResult.draftText,
        hook: result.hook,
        structureTemplateId: structureTemplate.id,
        voiceScore,
        editedText: null,
        aiTellFlags: buildAiTellFlagsJson(scanResult, voiceFlags),
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
