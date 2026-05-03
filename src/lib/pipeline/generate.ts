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

/** Pick the user's topic subscription that best matches how this research item was sourced (RSS URL overlap, then title/summary keywords). */
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
};

export type GenerateCronResult = {
  usersProcessed: number;
  draftsGenerated: number;
  errors: number;
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

export async function runGeneratePipelineForUser(userId: string): Promise<GenerateUserResult> {
  const settings = await db.query.userSettings.findFirst({ where: eq(userSettings.userId, userId) });
  if (!settings) return { userId, draftsGenerated: 0, skipped: true, reason: "missing_settings" };
  if (settings.cadenceMode === "on_demand") {
    return { userId, draftsGenerated: 0, skipped: true, reason: "on_demand" };
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
    return { userId, draftsGenerated: 0, skipped: true, reason: "pending_limit_reached" };
  }

  const subscriptions = await db
    .select()
    .from(topicSubscriptions)
    .where(and(eq(topicSubscriptions.userId, userId), eq(topicSubscriptions.active, true)));
  const topics = subscriptions.map((s) => s.topicLabel);
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
  const selected = candidates.slice(0, needed);
  const voiceProfile = await db.query.voiceProfiles.findFirst({ where: eq(voiceProfiles.userId, userId) });
  const recentRejections = await db.query.rejectionReasons.findMany({
    where: eq(rejectionReasons.userId, userId),
    orderBy: [desc(rejectionReasons.createdAt)],
    limit: 10,
  });

  const structureTemplate = await selectStructureTemplate(userId);

  let draftsGenerated = 0;
  for (const item of selected) {
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
      sentenceLength: voiceProfile?.sentenceLength,
      hookStyle: voiceProfile?.hookStyle,
      pov: voiceProfile?.pov,
      toneMarkers: voiceProfile?.toneMarkers,
      formattingStyle: voiceProfile?.formattingStyle,
      userBannedWords: voiceProfile?.userBannedWords,
      userNotes: voiceProfile?.userNotes,
      extractedPatterns: voiceProfile?.extractedPatterns ?? {},
      rawDescription: voiceProfile?.rawDescription ?? topics.join(", "),
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

    const topicMatch = matchTopicSubscriptionForResearchItem(subscriptions, {
      url: item.url,
      title: item.title,
      summary: item.summary,
      sourceType: item.sourceType,
    });

    await db.insert(draftQueue).values({
      userId,
      researchItemId: item.id,
      ...(topicMatch && {
        topicSubscriptionId: topicMatch.topicSubscriptionId,
        topicLabel: topicMatch.topicLabel,
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

  return { userId, draftsGenerated, skipped: false };
}

export async function runGenerateForDueUsers(): Promise<GenerateCronResult> {
  await archiveStalePendingDrafts();
  let usersProcessed = 0;
  let draftsGenerated = 0;
  let errors = 0;
  const settingsRows = await getUsersDueForGenerateRun();

  for (const settings of settingsRows) {
    try {
      usersProcessed += 1;
      const result = await runGeneratePipelineForUser(settings.userId);
      draftsGenerated += result.draftsGenerated;
    } catch (error) {
      errors += 1;
      console.error("Generate pipeline failed for user:", settings.userId, error);
    }
  }

  return { usersProcessed, draftsGenerated, errors };
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
