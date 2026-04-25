import { and, asc, desc, eq, inArray, lte, notInArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  draftQueue,
  linkedinTokens,
  posts,
  rejectionReasons,
  researchItems,
  topicSubscriptions,
  userSettings,
  voiceProfiles,
} from "@/lib/db/schema";
import { getCronSecret } from "@/lib/linkedin/oauth";
import { publishToLinkedIn } from "@/lib/linkedin/publish";
import { generateDraft } from "@/lib/ai/generate-draft";
import { scoreVoice } from "@/lib/ai/score-voice";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${getCronSecret()}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    await db
      .update(draftQueue)
      .set({ status: "archived" })
      .where(and(eq(draftQueue.status, "pending"), lte(draftQueue.staleAfter, new Date())));

    let postsPublished = 0;
    let postsFailed = 0;
    let errors = 0;

    const scheduledPosts = await db.query.posts.findMany({
      where: and(eq(posts.status, "scheduled"), lte(posts.scheduledAt, new Date())),
    });
    for (const post of scheduledPosts) {
      try {
        const token = await db.query.linkedinTokens.findFirst({ where: eq(linkedinTokens.userId, post.userId) });
        if (!token || token.status === "expired" || token.tokenExpiry < new Date()) {
          await db.update(linkedinTokens).set({ status: "expired", updatedAt: new Date() }).where(eq(linkedinTokens.userId, post.userId));
          await db.update(posts).set({ status: "failed", failureReason: "LinkedIn token expired. Please reconnect LinkedIn in Settings." }).where(eq(posts.id, post.id));
          postsFailed += 1;
          continue;
        }
        await db.update(posts).set({ status: "publishing" }).where(eq(posts.id, post.id));
        const result = await publishToLinkedIn(token.accessToken, token.personUrn, post.contentSnapshot);
        if (result.success) {
          await db.update(posts).set({ status: "published", linkedinPostId: result.postId, publishedAt: new Date() }).where(eq(posts.id, post.id));
          await db.update(draftQueue).set({ status: "published" }).where(eq(draftQueue.id, post.draftId));
          postsPublished += 1;
        } else if (result.error === "TOKEN_EXPIRED") {
          await db.update(linkedinTokens).set({ status: "expired", updatedAt: new Date() }).where(eq(linkedinTokens.userId, post.userId));
          await db.update(posts).set({ status: "failed", failureReason: "LinkedIn token expired. Please reconnect LinkedIn in Settings." }).where(eq(posts.id, post.id));
          postsFailed += 1;
        } else {
          await db.update(posts).set({ status: "failed", failureReason: result.error }).where(eq(posts.id, post.id));
          postsFailed += 1;
        }
      } catch {
        errors += 1;
      }
    }

    const settingsRows = await db.select().from(userSettings).where(notInArray(userSettings.cadenceMode, ["on_demand"]));
    let usersProcessed = 0;
    let draftsGenerated = 0;

    for (const settings of settingsRows) {
      try {
        if (settings.cadenceMode === "weekly" && new Date().getUTCDay() !== 6) continue;
        usersProcessed += 1;
        const userId = settings.userId;
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
            extractedPatterns: voiceProfile?.extractedPatterns ?? {},
            rawDescription: voiceProfile?.rawDescription ?? topics.join(", "),
            title: item.title,
            summary: item.summary ?? "",
            url: item.url,
            rejections: recentRejections,
          });
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
            sourceUrls: [item.url],
            voiceScore,
            status: "pending",
            staleAfter: new Date(Date.now() + (isRecentNews ? 72 : 24 * 7) * 60 * 60 * 1000),
          });
          draftsGenerated += 1;
        }
      } catch {
        errors += 1;
      }
    }

    return Response.json({ usersProcessed, draftsGenerated, postsPublished, postsFailed, errors });
  } catch {
    return Response.json({ error: "Generate cron failed" }, { status: 400 });
  }
}
