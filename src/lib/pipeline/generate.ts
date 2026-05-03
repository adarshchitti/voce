import { and, desc, eq, gt, lte, notInArray, or, sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  cronRuns,
  draftMemories,
  draftQueue,
  rejectionReasons,
  researchItems,
  topicSubscriptions,
  userSettings,
  voiceProfiles,
} from "@/lib/db/schema";
import { generateDraft } from "@/lib/ai/generate-draft";
import { selectStructureTemplate } from "@/lib/ai/structure-templates";
import { scanDraftForAITells, serializeAiTellFlags } from "@/lib/ai/scan-draft";
import { scoreVoice } from "@/lib/ai/score-voice";
import { buildVoicePromptSlice } from "@/lib/ai/voice-slice";
import { getSubscriptionStatus } from "@/lib/subscription";
import {
  judgeResearchForUser,
  rankJudgedCandidates,
  type RankedCandidate,
} from "@/lib/ai/judge-research";

function urlMatchesSubscriptionSource(itemUrl: string, sourceUrl: string): boolean {
  const s = sourceUrl.trim();
  if (!s) return false;
  try {
    const item = new URL(itemUrl);
    const src = new URL(s);
    const itemHost = item.hostname.replace(/^www\./, "");
    const srcHost = src.hostname.replace(/^www\./, "");
    if (itemHost === srcHost) return true;
  } catch {
    /* ignore */
  }
  return itemUrl.includes(s) || s.includes(itemUrl);
}

/**
 * Legacy keyword-overlap topic matcher. Used by quick generate; the daily
 * cron now relies on the Haiku judge's matched_topic_id instead.
 */
export function matchTopicSubscriptionForResearchItem(
  subscriptions: InferSelectModel<typeof topicSubscriptions>[],
  item: { url: string; title: string; summary: string | null; sourceType: string },
): { topicSubscriptionId: string; topicLabel: string } | null {
  if (!subscriptions.length) return null;

  const rssMatches: InferSelectModel<typeof topicSubscriptions>[] = [];
  for (const sub of subscriptions) {
    for (const src of sub.sourceUrls ?? []) {
      if (urlMatchesSubscriptionSource(item.url, src)) {
        rssMatches.push(sub);
        break;
      }
    }
  }
  if (rssMatches.length === 1) {
    const sub = rssMatches[0];
    return { topicSubscriptionId: sub.id, topicLabel: sub.topicLabel };
  }
  if (rssMatches.length > 1) {
    const sub = [...rssMatches].sort((a, b) => (b.priorityWeight ?? 3) - (a.priorityWeight ?? 3))[0];
    return { topicSubscriptionId: sub.id, topicLabel: sub.topicLabel };
  }

  const haystack = `${item.title} ${item.summary ?? ""}`.toLowerCase();
  let best: { sub: InferSelectModel<typeof topicSubscriptions>; score: number } | null = null;
  for (const sub of subscriptions) {
    const labelTokens = sub.topicLabel
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2);
    const queryTokens = sub.tavilyQuery
      .toLowerCase()
      .split(/[\s,]+/)
      .filter((t) => t.length > 2);
    const tokens = [...new Set([...labelTokens, ...queryTokens])];
    let score = 0;
    for (const token of tokens) {
      if (haystack.includes(token)) score += 1;
    }
    if (score > 0) {
      if (
        !best ||
        score > best.score ||
        (score === best.score && (sub.priorityWeight ?? 3) > (best.sub.priorityWeight ?? 3))
      ) {
        best = { sub, score };
      }
    }
  }
  if (best) {
    return { topicSubscriptionId: best.sub.id, topicLabel: best.sub.topicLabel };
  }
  return null;
}

export type GenerateUserResult = {
  userId: string;
  draftsGenerated: number;
  skipped: boolean;
  reason?: string;
  candidatesConsidered: number;
  candidatesPassingThreshold: number;
  judgeUsed: boolean;
  judgeDurationMs: number;
  judgeFallbackReason: string | null;
};

export type GenerateCronResult = {
  usersProcessed: number;
  draftsGenerated: number;
  errors: number;
  perUser: GenerateUserResult[];
};

export async function getUsersDueForGenerateRun() {
  const isSaturdayUtc = new Date().getUTCDay() === 6;
  return db
    .select({ userId: userSettings.userId })
    .from(userSettings)
    .where(
      isSaturdayUtc
        ? or(eq(userSettings.cadenceMode, "daily"), eq(userSettings.cadenceMode, "weekly"))
        : eq(userSettings.cadenceMode, "daily"),
    );
}

export async function archiveStalePendingDrafts() {
  await db
    .update(draftQueue)
    .set({ status: "archived" })
    .where(and(eq(draftQueue.status, "pending"), lte(draftQueue.staleAfter, new Date())));
}

function emptyResult(userId: string, reason: string): GenerateUserResult {
  return {
    userId,
    draftsGenerated: 0,
    skipped: true,
    reason,
    candidatesConsidered: 0,
    candidatesPassingThreshold: 0,
    judgeUsed: false,
    judgeDurationMs: 0,
    judgeFallbackReason: null,
  };
}

async function persistUserCronResult(result: GenerateUserResult): Promise<void> {
  const status = result.skipped
    ? null
    : result.draftsGenerated > 0
      ? ("success_with_drafts" as const)
      : ("success_no_drafts" as const);
  if (status !== null) {
    await db
      .update(userSettings)
      .set({ lastCronStatus: status, lastCronAt: new Date() })
      .where(eq(userSettings.userId, result.userId))
      .catch((err) => {
        console.error("Failed to persist last_cron_status for user:", result.userId, err);
      });
  }
  await db
    .insert(cronRuns)
    .values({
      phase: "generate",
      result,
      errorCount: 0,
      success: result.draftsGenerated > 0,
    })
    .catch((err) => {
      console.error("Failed to log per-user cron run:", err);
    });
}

async function persistUserCronFailure(userId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await db
    .update(userSettings)
    .set({ lastCronStatus: "failed", lastCronAt: new Date() })
    .where(eq(userSettings.userId, userId))
    .catch(() => undefined);
  await db
    .insert(cronRuns)
    .values({
      phase: "generate",
      result: { userId, error: message.slice(0, 500), candidatesConsidered: 0, draftsGenerated: 0 },
      errorCount: 1,
      success: false,
    })
    .catch(() => undefined);
}

export async function runGeneratePipelineForUser(userId: string): Promise<GenerateUserResult> {
  const settings = await db.query.userSettings.findFirst({ where: eq(userSettings.userId, userId) });
  if (!settings) return emptyResult(userId, "missing_settings");
  if (settings.cadenceMode === "on_demand") return emptyResult(userId, "on_demand");

  // Closes the gap PROJECT_TRUTH.md:271 flagged: cron used to generate drafts
  // for users with no Stripe subscription. Beta-access users pass this check
  // via the beta-first branch in getSubscriptionStatus.
  const access = await getSubscriptionStatus(userId);
  if (!access.canGenerate) {
    const skipped = emptyResult(userId, "no_access");
    await persistUserCronResult(skipped);
    return skipped;
  }

  const sensitivitySettings = {
    tellFlagNumberedLists: (settings.tellFlagNumberedLists ?? "three_plus") as
      | "always"
      | "three_plus"
      | "never",
    tellFlagEmDash: settings.tellFlagEmDash ?? true,
    tellFlagEngagementBeg: settings.tellFlagEngagementBeg ?? true,
    tellFlagBannedWords: settings.tellFlagBannedWords ?? true,
    tellFlagEveryLine: settings.tellFlagEveryLine ?? true,
  };

  const [pendingCount] = await db
    .select({ value: sql<number>`count(*)` })
    .from(draftQueue)
    .where(and(eq(draftQueue.userId, userId), eq(draftQueue.status, "pending")));
  if (pendingCount.value >= settings.draftsPerDay) {
    return emptyResult(userId, "pending_limit_reached");
  }

  const subscriptions = await db
    .select()
    .from(topicSubscriptions)
    .where(and(eq(topicSubscriptions.userId, userId), eq(topicSubscriptions.active, true)));
  const topics = subscriptions.map((s) => s.topicLabel);
  const subscriptionsById = new Map(subscriptions.map((s) => [s.id, s]));

  const recentDrafts = await db
    .select({ id: draftQueue.researchItemId })
    .from(draftQueue)
    .where(and(eq(draftQueue.userId, userId), lte(draftQueue.generatedAt, new Date(Date.now() + 1))))
    .orderBy(desc(draftQueue.generatedAt))
    .limit(200);
  const excludeIds = recentDrafts.map((r) => r.id).filter((v): v is string => Boolean(v));
  const recencyCutoff = sql`now() - interval '72 hours'`;
  const recencyPredicate = gt(researchItems.publishedAt, recencyCutoff);
  const candidates = await db
    .select()
    .from(researchItems)
    .where(
      excludeIds.length
        ? and(recencyPredicate, notInArray(researchItems.id, excludeIds))
        : recencyPredicate,
    )
    .orderBy(
      desc(sql`coalesce(${researchItems.relevanceScore}, 0) + coalesce(${researchItems.originalityScore}, 0)`),
    )
    .limit(30);

  const needed = Math.max(0, settings.draftsPerDay - pendingCount.value);

  // Per-user judge + priority-weighted ranking. Falls back to deterministic
  // global-score order if Haiku times out, throws, or returns malformed JSON.
  let ranked: RankedCandidate<(typeof candidates)[number]>[] = [];
  let judgeUsed = true;
  let judgeDurationMs = 0;
  let judgeFallbackReason: string | null = null;

  if (candidates.length === 0 || subscriptions.length === 0) {
    judgeUsed = false;
    judgeFallbackReason = candidates.length === 0 ? "no_candidates_in_window" : "no_active_subscriptions";
  } else {
    const judged = await judgeResearchForUser({
      candidates: candidates.map((c) => ({
        id: c.id,
        title: c.title,
        summary: c.summary ?? "",
        published_at: c.publishedAt ? c.publishedAt.toISOString() : "",
      })),
      userTopics: subscriptions.map((s) => ({
        id: s.id,
        topic_label: s.topicLabel,
        tavily_query: s.tavilyQuery,
      })),
    });
    judgeDurationMs = judged.durationMs;
    if (!judged.ok) {
      judgeUsed = false;
      judgeFallbackReason = judged.reason;
      console.warn(`[generate] judge fallback for user ${userId}: ${judged.reason}`);
    }
    ranked = rankJudgedCandidates({
      candidates,
      topicsById: new Map(
        subscriptions.map((s) => [s.id, { id: s.id, priorityWeight: s.priorityWeight }]),
      ),
      judgeOutcome: judged,
    });
  }

  const candidatesPassingThreshold = ranked.length;
  const selected = ranked.slice(0, needed);

  const result: GenerateUserResult = {
    userId,
    draftsGenerated: 0,
    skipped: false,
    candidatesConsidered: candidates.length,
    candidatesPassingThreshold,
    judgeUsed,
    judgeDurationMs,
    judgeFallbackReason,
  };

  if (selected.length === 0) {
    await persistUserCronResult(result);
    return result;
  }

  const voiceProfile = await db.query.voiceProfiles.findFirst({ where: eq(voiceProfiles.userId, userId) });
  const recentRejections = await db.query.rejectionReasons.findMany({
    where: eq(rejectionReasons.userId, userId),
    orderBy: [desc(rejectionReasons.createdAt)],
    limit: 10,
  });
  const structureTemplate = await selectStructureTemplate(userId);
  const voiceSlice = buildVoicePromptSlice(voiceProfile);
  const rawDescription = voiceProfile?.rawDescription ?? topics.join(", ");

  let draftsGenerated = 0;
  for (const ranking of selected) {
    const item = ranking.item;
    const topicCluster = item.sourceType ?? "general";
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
      .limit(3);

    const draftParams = {
      ...voiceSlice,
      rawDescription,
      title: item.title,
      summary: item.summary ?? "",
      url: item.url,
      rejections: recentRejections,
      structureTemplate,
      relevantMemories,
      rulesManifest: null,
    };

    const generated = await generateDraft(draftParams);
    let scanResult = await scanDraftForAITells(generated.draftText, sensitivitySettings);

    if (scanResult.hasEngagementBeg) {
      try {
        const regenerated = await generateDraft({
          ...draftParams,
          instruction:
            "Do not end with any question or engagement request directed at the reader. End on your observation or takeaway.",
        });
        const rescan = await scanDraftForAITells(regenerated.draftText, sensitivitySettings);
        Object.assign(generated, regenerated);
        Object.assign(scanResult, rescan);
      } catch {
        console.error("Engagement beg regeneration failed — proceeding with original");
      }
    }

    const voiceScore = voiceProfile?.calibrated
      ? await scoreVoice({ extractedPatterns: voiceProfile.extractedPatterns, draftText: generated.draftText })
      : null;
    const isRecentNews =
      item.sourceType === "tavily_news" ||
      (!!item.publishedAt && Date.now() - item.publishedAt.getTime() <= 48 * 60 * 60 * 1000);

    const matchedSub = ranking.matchedTopicId ? subscriptionsById.get(ranking.matchedTopicId) : undefined;

    await db.insert(draftQueue).values({
      userId,
      researchItemId: item.id,
      ...(matchedSub && {
        topicSubscriptionId: matchedSub.id,
        topicLabel: matchedSub.topicLabel,
      }),
      draftText: generated.draftText,
      hook: generated.hook,
      format: generated.format,
      hashtags: generated.hashtags ?? [],
      sourceUrls: [item.url],
      voiceScore,
      aiTellFlags: serializeAiTellFlags(scanResult),
      status: "pending",
      staleAfter: new Date(Date.now() + (isRecentNews ? 72 : 24 * 7) * 60 * 60 * 1000),
      structureTemplateId: structureTemplate.id,
    });
    draftsGenerated += 1;
  }

  result.draftsGenerated = draftsGenerated;
  await persistUserCronResult(result);
  return result;
}

export async function runGenerateForDueUsers(): Promise<GenerateCronResult> {
  await archiveStalePendingDrafts();
  let usersProcessed = 0;
  let draftsGenerated = 0;
  let errors = 0;
  const perUser: GenerateUserResult[] = [];
  const settingsRows = await getUsersDueForGenerateRun();

  for (const settings of settingsRows) {
    try {
      usersProcessed += 1;
      const result = await runGeneratePipelineForUser(settings.userId);
      draftsGenerated += result.draftsGenerated;
      perUser.push(result);
    } catch (error) {
      errors += 1;
      console.error("Generate pipeline failed for user:", settings.userId, error);
      await persistUserCronFailure(settings.userId, error);
    }
  }

  return { usersProcessed, draftsGenerated, errors, perUser };
}

export async function logGenerateRun(startTime: number, result: GenerateCronResult) {
  await db
    .insert(cronRuns)
    .values({
      phase: "generate",
      durationMs: Date.now() - startTime,
      result,
      errorCount: result.errors,
      success: result.draftsGenerated > 0,
    })
    .catch((err) => {
      console.error("Failed to log cron run:", err);
    });
}
