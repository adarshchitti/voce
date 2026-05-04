import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  draftMemories,
  draftQueue,
  regenerationHistory,
  rejectionReasons,
  researchItems,
  userSettings,
  voiceProfiles,
} from "@/lib/db/schema";
import { getAuthenticatedUser } from "@/lib/auth";
import { getSubscriptionStatus } from "@/lib/subscription";
import { generateDraft } from "@/lib/ai/generate-draft";
import type { RuleContext } from "@/lib/ai/quality-rules";
import { buildAiTellFlagsJson, scanDraftForAITells } from "@/lib/ai/scan-draft";
import { selectStructureTemplate } from "@/lib/ai/structure-templates";
import { scoreVoiceDetailed } from "@/lib/ai/score-voice";
import { sanitiseInstruction } from "@/lib/sanitise";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, unauthorized } = await getAuthenticatedUser();
    if (unauthorized) return unauthorized;
    const { canGenerate } = await getSubscriptionStatus(userId);
    if (!canGenerate) {
      return Response.json(
        { error: "Subscription required", code: "SUBSCRIPTION_REQUIRED" },
        { status: 402 },
      );
    }
    const { id } = await params;
    const body = (await request.json()) as { instruction?: string };
    const instruction = body.instruction ? sanitiseInstruction(body.instruction) : undefined;
    if (!instruction?.trim()) return Response.json({ error: "instruction is required" }, { status: 400 });
    const original = await db.query.draftQueue.findFirst({ where: and(eq(draftQueue.id, id), eq(draftQueue.userId, userId)) });
    if (!original || !original.researchItemId) return Response.json({ error: "Draft not found" }, { status: 404 });
    const originalDraftText = original.editedText?.trim() ? original.editedText : original.draftText;
    const researchItem = await db.query.researchItems.findFirst({ where: eq(researchItems.id, original.researchItemId) });
    if (!researchItem) return Response.json({ error: "Research item missing" }, { status: 400 });
    const voiceProfile = await db.query.voiceProfiles.findFirst({ where: eq(voiceProfiles.userId, userId) });
    const rejections = await db.query.rejectionReasons.findMany({ where: eq(rejectionReasons.userId, userId), orderBy: [desc(rejectionReasons.createdAt)], limit: 10 });
    const settings = await db.query.userSettings.findFirst({ where: eq(userSettings.userId, userId) });

    const structureTemplate = await selectStructureTemplate(userId);
    const topicCluster = researchItem.sourceType ?? "general";
    // Exclude any draftMemory tied to the draft being regenerated so the
    // template-repeat scan doesn't compare a regenerated draft against an
    // older approved version of itself.
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
          ne(draftMemories.draftId, id),
        ),
      )
      .orderBy(desc(draftMemories.createdAt))
      .limit(3);

    const generated = await generateDraft({
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
      extractedPatterns: voiceProfile?.extractedPatterns ?? {},
      rawDescription: voiceProfile?.rawDescription ?? "",
      title: researchItem.title,
      summary: researchItem.summary ?? "",
      url: researchItem.url,
      rejections,
      instruction,
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
    const scanResult = scanDraftForAITells(generated.draftText, scanContext, {
      recentMemories: relevantMemories,
    });

    const voiceResult = voiceProfile?.calibrated
      ? await scoreVoiceDetailed({ voiceProfile, draftText: scanResult.draftText })
      : null;
    const voiceScore = voiceResult?.score ?? null;
    const nextSequence = (original.regenerationCount ?? 0) + 1;
    const sanitisedInstruction = body.instruction ? sanitiseInstruction(body.instruction) : null;
    const [created] = await db
      .insert(draftQueue)
      .values({
        userId,
        researchItemId: original.researchItemId,
        topicSubscriptionId: original.topicSubscriptionId ?? undefined,
        topicLabel: original.topicLabel ?? undefined,
        draftText: scanResult.draftText,
        hook: generated.hook,
        format: generated.format,
        sourceUrls: [researchItem.url],
        voiceScore,
        aiTellFlags: buildAiTellFlagsJson(scanResult, voiceResult?.flags),
        status: "pending",
        regenerationCount: nextSequence,
        staleAfter: original.staleAfter,
        structureTemplateId: structureTemplate.id,
      })
      .returning();
    await db.insert(regenerationHistory).values({
      userId,
      draftId: id,
      instruction: sanitisedInstruction,
      draftTextBefore: originalDraftText,
      draftTextAfter: scanResult.draftText,
      sequenceNumber: nextSequence,
    });
    await db.update(draftQueue).set({ regenerationCount: nextSequence }).where(eq(draftQueue.id, id));
    await db.update(draftQueue).set({ status: "rejected" }).where(and(eq(draftQueue.id, id), eq(draftQueue.userId, userId)));
    await db.insert(rejectionReasons).values({ userId, draftId: id, reasonCode: "other", freeText: `Regenerated: ${instruction}`, rejectionType: "other" });
    return Response.json({ draft: created });
  } catch {
    return Response.json({ error: "Failed to regenerate draft" }, { status: 400 });
  }
}
