import { and, desc, eq, lte, notInArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { draftQueue, rejectionReasons, researchItems, topicSubscriptions, voiceProfiles } from "@/lib/db/schema";
import { getAuthenticatedUser } from "@/lib/auth";
import { generateDraft } from "@/lib/ai/generate-draft";
import { scanDraftForAITells } from "@/lib/ai/scan-draft";
import { scoreVoice } from "@/lib/ai/score-voice";

export async function POST() {
  try {
    const { userId, unauthorized } = await getAuthenticatedUser();
    if (unauthorized) return unauthorized;

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

    const [voiceProfile, recentRejections] = await Promise.all([
      db.query.voiceProfiles.findFirst({ where: eq(voiceProfiles.userId, userId) }),
      db.query.rejectionReasons.findMany({
        where: eq(rejectionReasons.userId, userId),
        orderBy: [desc(rejectionReasons.createdAt)],
        limit: 10,
      }),
    ]);

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
      userBannedWords: voiceProfile?.userBannedWords,
      userNotes: voiceProfile?.userNotes,
      extractedPatterns: voiceProfile?.extractedPatterns ?? {},
      rawDescription: voiceProfile?.rawDescription ?? topics.join(", "),
      title: candidate.title,
      summary: candidate.summary ?? "",
      url: candidate.url,
      rejections: recentRejections,
    });

    const scanResult = await scanDraftForAITells(generated.draftText);
    const voiceScore = voiceProfile?.calibrated
      ? await scoreVoice({ extractedPatterns: voiceProfile.extractedPatterns, draftText: generated.draftText })
      : null;
    const isRecentNews =
      candidate.sourceType === "tavily_news" ||
      (!!candidate.publishedAt && Date.now() - candidate.publishedAt.getTime() <= 48 * 60 * 60 * 1000);

    const [draft] = await db
      .insert(draftQueue)
      .values({
        userId,
        researchItemId: candidate.id,
        draftText: generated.draftText,
        hook: generated.hook,
        format: generated.format,
        hashtags: generated.hashtags ?? [],
        sourceUrls: [candidate.url],
        voiceScore,
        aiTellFlags: scanResult.clean
          ? null
          : JSON.stringify({
              words: scanResult.flaggedWords,
              structure: scanResult.structureIssues,
            }),
        status: "pending",
        staleAfter: new Date(Date.now() + (isRecentNews ? 72 : 24 * 7) * 60 * 60 * 1000),
      })
      .returning({ id: draftQueue.id });

    return Response.json({ draftId: draft.id });
  } catch {
    return Response.json({ error: "Failed to generate draft" }, { status: 400 });
  }
}

