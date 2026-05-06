import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { draftMemories, draftQueue, rejectionReasons, researchItems, userSettings, voiceProfiles } from "@/lib/db/schema";
import { getAuthenticatedUser } from "@/lib/auth";
import { generateDraft } from "@/lib/ai/generate-draft";
import { selectStructureTemplate } from "@/lib/ai/structure-templates";
import type { RuleContext } from "@/lib/ai/quality-rules";
import { buildAiTellFlagsJson, runFactCheckOrSkip, scanDraftForAITells } from "@/lib/ai/scan-draft";
import { scoreVoiceDetailed } from "@/lib/ai/score-voice";
import { selectPersonalContextForDraft } from "@/lib/ai/select-personal-context";
import { buildPersonalAngleInstruction } from "@/lib/ai/personal-angle";
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

    const personalContext = voiceProfile?.personalContext ?? null;
    const personalContextComponents =
      (voiceProfile?.personalContextComponents as string[] | null) ?? [];

    // Hard 400 when neither raw context nor extracted components exist. The
    // frontend reads code=NO_PERSONAL_CONTEXT to surface a "set this up in
    // settings" message and disables the button. Spec override (work-stream
    // 2): silently personalizing for tone when there's nothing personal would
    // mislead the user about what the feature is doing.
    if (!personalContext && personalContextComponents.length === 0) {
      return Response.json(
        {
          error: "Add personal experiences in settings to use this feature.",
          code: "NO_PERSONAL_CONTEXT",
          settingsUrl: "/settings",
        },
        { status: 400 },
      );
    }

    // Selection step. Run only when components are available; the selector
    // returns null (no fit) gracefully and the route still personalizes for
    // tone via the legacy raw-context fallback below.
    const baseDraftText = draft.editedText?.trim() ? draft.editedText : draft.draftText;
    const selection =
      personalContextComponents.length > 0
        ? await selectPersonalContextForDraft(baseDraftText, personalContextComponents)
        : { selectedIndex: null, rationale: null };

    const selectedComponent =
      selection.selectedIndex !== null
        ? personalContextComponents[selection.selectedIndex] ?? null
        : null;

    // Build the personalization instruction. Three branches:
    //   1. selectedComponent set        → targeted PERSONAL ANGLE block
    //   2. components empty but raw ctx → legacy raw-context fallback
    //   3. components present but none  → legacy fallback (tone-only personalization)
    //      fit (selection miss)
    let personalInstruction: string;
    let personalizationMode: "targeted" | "no_fit" | "legacy_raw_context";
    if (selectedComponent) {
      personalInstruction = buildPersonalAngleInstruction(selectedComponent);
      personalizationMode = "targeted";
    } else if (personalContext) {
      const safePersonalContext = sanitiseShortText(personalContext, FIELD_LIMITS.personalContext);
      personalInstruction = `
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
      personalizationMode =
        personalContextComponents.length > 0 ? "no_fit" : "legacy_raw_context";
    } else {
      // Components present but selection returned null AND no raw context to
      // fall back on (rare — the user cleared the textarea but components
      // from a prior extraction remain). Still personalize for tone with a
      // light prompt; the UI will show the "no fit" notice.
      personalInstruction =
        "Personalize this post for the user's voice and tone. No specific personal experience fits this topic.";
      personalizationMode = "no_fit";
    }

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
    const initialScan = scanDraftForAITells(result.draftText, scanContext, {
      recentMemories: relevantMemories,
    });
    // researchItem is null when the original draft has no researchItemId
    // (older drafts predating the research-item link). Skip the verifier
    // rather than synthesizing a fake source — runFactCheckOrSkip handles
    // the null case with a structured log.
    //
    // When a personal-context component was selected, pass it to the
    // verifier as permittedClaims so the matching first-person claim
    // doesn't trip the source-grounding flag (concern 8 from the build
    // report — every successful targeted personalization would otherwise
    // trigger a false-positive on the very claim it just injected).
    const factCheckResult = await runFactCheckOrSkip(
      initialScan,
      researchItem
        ? { title: researchItem.title, url: researchItem.url, content: researchItem.summary ?? "" }
        : null,
      "route.personalize",
      selectedComponent,
    );
    const scanResult = factCheckResult.scanResult;
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

    return Response.json({
      ...updated,
      personalization: {
        mode: personalizationMode,
        componentUsed: selectedComponent,
        rationale: selection.rationale,
      },
    });
  } catch (error) {
    console.error("Personalize failed:", error);
    return Response.json({ error: "Failed to personalize draft" }, { status: 500 });
  }
}
