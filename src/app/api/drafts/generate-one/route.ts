import { and, desc, eq, lte, notInArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  draftMemories,
  draftQueue,
  rejectionReasons,
  researchItems,
  topicSubscriptions,
  userSettings,
  voiceProfiles,
} from "@/lib/db/schema";
import { getAuthenticatedUser } from "@/lib/auth";
import { getSubscriptionStatus } from "@/lib/subscription";
import { generateDraft } from "@/lib/ai/generate-draft";
import { selectStructureTemplate } from "@/lib/ai/structure-templates";
import { matchTopicSubscriptionForResearchItem } from "@/lib/pipeline/generate";
import type { RuleContext } from "@/lib/ai/quality-rules";
import { scanDraftForAITells, serializeAiTellFlags } from "@/lib/ai/scan-draft";
import { scoreVoice } from "@/lib/ai/score-voice";

export async function POST() {
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

    const subscriptions = await db
      .select()
      .from(topicSubscriptions)
      .where(and(eq(topicSubscriptions.userId, userId), eq(topicSubscriptions.active, true)));
    const topics = subscriptions.map((subscription) => subscription.topicLabel);

    const recentDrafts = await db
      .select({ id: draftQueue.researchItemId })
      .from(draftQueue)
      .where(and(eq(draftQueue.userId, userId), lte(draftQueue.generatedAt, new Date(Date.now() + 1))))
      .orderBy(desc(draftQueue.generatedAt))
      .limit(200);
    const excludeIds = recentDrafts.map((row) => row.id).filter((value): value is string => Boolean(value));

    const [candidate] = await db
      .select()
      .from(researchItems)
      .where(excludeIds.length ? notInArray(researchItems.id, excludeIds) : undefined)
      .orderBy(desc(sql`coalesce(${researchItems.relevanceScore}, 0) + coalesce(${researchItems.originalityScore}, 0)`))
      .limit(1);

    if (!candidate) {
      return Response.json({ error: "No research items available for generation" }, { status: 404 });
    }

    const [voiceProfile, recentRejections, settings] = await Promise.all([
      db.query.voiceProfiles.findFirst({ where: eq(voiceProfiles.userId, userId) }),
      db.query.rejectionReasons.findMany({
        where: eq(rejectionReasons.userId, userId),
        orderBy: [desc(rejectionReasons.createdAt)],
        limit: 10,
      }),
      db.query.userSettings.findFirst({ where: eq(userSettings.userId, userId) }),
    ]);

    const structureTemplate = await selectStructureTemplate(userId);

    const topicCluster = candidate.sourceType ?? "general";
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

    const draftParams = {
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
      rawDescription: voiceProfile?.rawDescription ?? topics.join(", "),
      title: candidate.title,
      summary: candidate.summary ?? "",
      url: candidate.url,
      rejections: recentRejections,
      structureTemplate,
      relevantMemories,
      rulesManifest: null,
    };

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

    const generated = await generateDraft(draftParams);
    let scanResult = scanDraftForAITells(generated.draftText, scanContext, {
      recentMemories: relevantMemories,
    });

    if (scanResult.hasEngagementBeg) {
      try {
        const regenerated = await generateDraft({
          ...draftParams,
          instruction:
            "Do not end with any question or engagement request directed at the reader. End on your observation or takeaway.",
        });
        const rescan = scanDraftForAITells(regenerated.draftText, scanContext, {
          recentMemories: relevantMemories,
        });
        Object.assign(generated, regenerated);
        scanResult = rescan;
      } catch {
        console.error("Engagement beg regeneration failed — proceeding with original");
      }
    }

    const voiceScore = voiceProfile?.calibrated
      ? await scoreVoice({ extractedPatterns: voiceProfile.extractedPatterns, draftText: scanResult.draftText })
      : null;
    const isRecentNews =
      candidate.sourceType === "tavily_news" ||
      (!!candidate.publishedAt && Date.now() - candidate.publishedAt.getTime() <= 48 * 60 * 60 * 1000);

    const topicMatch = matchTopicSubscriptionForResearchItem(subscriptions, {
      url: candidate.url,
      title: candidate.title,
      summary: candidate.summary,
      sourceType: candidate.sourceType,
    });

    const [draft] = await db
      .insert(draftQueue)
      .values({
        userId,
        researchItemId: candidate.id,
        ...(topicMatch && {
          topicSubscriptionId: topicMatch.topicSubscriptionId,
          topicLabel: topicMatch.topicLabel,
        }),
        draftText: scanResult.draftText,
        hook: generated.hook,
        format: generated.format,
        hashtags: generated.hashtags ?? [],
        sourceUrls: [candidate.url],
        voiceScore,
        aiTellFlags: serializeAiTellFlags(scanResult),
        status: "pending",
        staleAfter: new Date(Date.now() + (isRecentNews ? 72 : 24 * 7) * 60 * 60 * 1000),
        structureTemplateId: structureTemplate.id,
      })
      .returning({ id: draftQueue.id });

    return Response.json({ draftId: draft.id });
  } catch {
    return Response.json({ error: "Failed to generate draft" }, { status: 400 });
  }
}

