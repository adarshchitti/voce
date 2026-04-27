import { and, desc, eq, lte, notInArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  draftQueue,
  rejectionReasons,
  researchItems,
  topicSubscriptions,
  cronRuns,
  userSettings,
  voiceProfiles,
} from "@/lib/db/schema";
import { getCronSecret } from "@/lib/linkedin/oauth";
import { generateDraft } from "@/lib/ai/generate-draft";
import { scanDraftForAITells } from "@/lib/ai/scan-draft";
import { scoreVoice } from "@/lib/ai/score-voice";

export const GET = POST;

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${getCronSecret()}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const startTime = Date.now();

    await db
      .update(draftQueue)
      .set({ status: "archived" })
      .where(and(eq(draftQueue.status, "pending"), lte(draftQueue.staleAfter, new Date())));

    let errors = 0;

    const settingsRows = await db.select().from(userSettings).where(notInArray(userSettings.cadenceMode, ["on_demand"]));
    let usersProcessed = 0;
    let draftsGenerated = 0;

    for (const settings of settingsRows) {
      try {
        if (settings.cadenceMode === "weekly" && new Date().getUTCDay() !== 6) continue;
        usersProcessed += 1;
        const userId = settings.userId;
        const sensitivitySettings = {
          tellFlagNumberedLists: (settings.tellFlagNumberedLists ?? "three_plus") as "always" | "three_plus" | "never",
          tellFlagEmDash: settings.tellFlagEmDash ?? true,
          tellFlagEngagementBeg: settings.tellFlagEngagementBeg ?? true,
          tellFlagBannedWords: settings.tellFlagBannedWords ?? true,
          tellFlagEveryLine: settings.tellFlagEveryLine ?? true,
        };
        const [pendingCount] = await db.select({ value: sql<number>`count(*)` }).from(draftQueue).where(and(eq(draftQueue.userId, userId), eq(draftQueue.status, "pending")));
        if (pendingCount.value >= settings.draftsPerDay) continue;
        const subscriptions = await db.select().from(topicSubscriptions).where(and(eq(topicSubscriptions.userId, userId), eq(topicSubscriptions.active, true)));
        const topics = subscriptions.map((s) => s.topicLabel);
        const recentDrafts = await db
          .select({ id: draftQueue.researchItemId })
          .from(draftQueue)
          .where(and(eq(draftQueue.userId, userId), lte(draftQueue.generatedAt, new Date(Date.now() + 1))))
          .orderBy(desc(draftQueue.generatedAt))
          .limit(200);
        const excludeIds = recentDrafts.map((r) => r.id).filter((v): v is string => Boolean(v));
        const candidates = await db
          .select()
          .from(researchItems)
          .where(excludeIds.length ? notInArray(researchItems.id, excludeIds) : undefined)
          .orderBy(desc(sql`coalesce(${researchItems.relevanceScore}, 0) + coalesce(${researchItems.originalityScore}, 0)`))
          .limit(20);
        const needed = Math.max(0, settings.draftsPerDay - pendingCount.value);
        const selected = candidates.slice(0, needed);
        const voiceProfile = await db.query.voiceProfiles.findFirst({ where: eq(voiceProfiles.userId, userId) });
        const recentRejections = await db.query.rejectionReasons.findMany({
          where: eq(rejectionReasons.userId, userId),
          orderBy: [desc(rejectionReasons.createdAt)],
          limit: 10,
        });
        for (const item of selected) {
          const generated = await generateDraft({
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
          });
          const scanResult = await scanDraftForAITells(generated.draftText, sensitivitySettings);
          const voiceScore = voiceProfile?.calibrated
            ? await scoreVoice({ extractedPatterns: voiceProfile.extractedPatterns, draftText: generated.draftText })
            : null;
          const isRecentNews = item.sourceType === "tavily_news" || (!!item.publishedAt && Date.now() - item.publishedAt.getTime() <= 48 * 60 * 60 * 1000);
          await db.insert(draftQueue).values({
            userId,
            researchItemId: item.id,
            draftText: generated.draftText,
            hook: generated.hook,
            format: generated.format,
            hashtags: generated.hashtags ?? [],
            sourceUrls: [item.url],
            voiceScore,
            aiTellFlags: scanResult.clean
              ? null
              : JSON.stringify({
                  words: scanResult.flaggedWords,
                  structure: scanResult.structureIssues,
                }),
            status: "pending",
            staleAfter: new Date(Date.now() + (isRecentNews ? 72 : 24 * 7) * 60 * 60 * 1000),
          });
          draftsGenerated += 1;
        }
      } catch {
        errors += 1;
      }
    }

    const result = { usersProcessed, draftsGenerated, errors };
    await db
      .insert(cronRuns)
      .values({
        phase: "generate",
        durationMs: Date.now() - startTime,
        result,
        errorCount: errors,
        success: draftsGenerated > 0,
      })
      .catch((err) => {
        console.error("Failed to log cron run:", err);
      });
    return Response.json(result);
  } catch {
    return Response.json({ error: "Generate cron failed" }, { status: 400 });
  }
}
