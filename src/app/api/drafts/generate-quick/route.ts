import { and, desc, eq, gte, sql } from "drizzle-orm";
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
import { fetchTavily } from "@/lib/ai/tavily";
import { buildVoicePromptSlice } from "@/lib/ai/voice-slice";

const DAILY_LIMIT = 3;

export async function POST(req: Request) {
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

    const body = (await req.json()) as { topic?: string };
    const topic = (body.topic ?? "").trim();
    if (!topic || topic.length < 3) {
      return Response.json({ error: "Topic must be at least 3 characters" }, { status: 400 });
    }
    if (topic.length > 200) {
      return Response.json({ error: "Topic must be under 200 characters" }, { status: 400 });
    }

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const todayCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(draftQueue)
      .where(
        and(
          eq(draftQueue.userId, userId),
          eq(draftQueue.source, "quick_generate"),
          gte(draftQueue.generatedAt, todayStart),
        ),
      );

    const usedToday = todayCount[0]?.count ?? 0;

    if (usedToday >= DAILY_LIMIT) {
      return Response.json(
        {
          error: "Daily limit reached",
          code: "QUICK_GENERATE_LIMIT",
          remainingToday: 0,
          resetsAt: "midnight UTC",
        },
        { status: 429 },
      );
    }

    let results: Awaited<ReturnType<typeof fetchTavily>> = [];
    try {
      results = await fetchTavily({ query: topic });
    } catch {
      results = [];
    }
    const topResult = results[0];

    if (!topResult) {
      return Response.json(
        { error: "No articles found for this topic. Try a different search term." },
        { status: 404 },
      );
    }

    const dedupHash = Buffer.from(topResult.url + (topResult.title ?? "")).toString("base64").slice(0, 64);

    await db
      .insert(researchItems)
      .values({
        url: topResult.url,
        title: topResult.title ?? topic,
        summary: topResult.summary ? topResult.summary.slice(0, 500) : null,
        sourceType: topResult.sourceType,
        publishedAt: topResult.publishedAt,
        dedupHash,
        relevanceScore: "0.80",
        originalityScore: "0.70",
      })
      .onConflictDoNothing({ target: researchItems.url });

    const [candidate] = await db
      .select()
      .from(researchItems)
      .where(eq(researchItems.url, topResult.url))
      .limit(1);

    if (!candidate) {
      return Response.json({ error: "Failed to store research item" }, { status: 500 });
    }

    const subscriptions = await db
      .select()
      .from(topicSubscriptions)
      .where(and(eq(topicSubscriptions.userId, userId), eq(topicSubscriptions.active, true)));

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
      ...buildVoicePromptSlice(voiceProfile, { tellFlagEmDash: settings?.tellFlagEmDash ?? true }),
      rawDescription: topic,
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
        source: "quick_generate",
        staleAfter: new Date(Date.now() + 72 * 60 * 60 * 1000),
        structureTemplateId: structureTemplate.id,
      })
      .returning({ id: draftQueue.id });

    return Response.json({
      draftId: draft.id,
      remainingToday: DAILY_LIMIT - usedToday - 1,
    });
  } catch {
    return Response.json({ error: "Failed to generate draft" }, { status: 400 });
  }
}
