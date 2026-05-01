import { and, eq, lte, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { cronRuns, draftQueue, linkedinTokens, posts, researchItems, userSettings } from "@/lib/db/schema";
import { publishToLinkedIn } from "@/lib/linkedin/publish";

export type PublishSingleResult = {
  success: boolean;
  postId: string;
  error?: string;
};

export type PublishCronResult = {
  published: number;
  failed: number;
  errors: string[];
};

export async function getUsersDueForPublishRun() {
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

export async function runPublishForPost(postId: string, userId: string): Promise<PublishSingleResult> {
  const post = await db.query.posts.findFirst({
    where: and(eq(posts.id, postId), eq(posts.userId, userId), eq(posts.status, "scheduled")),
  });

  if (!post) return { success: false, postId, error: "Post not found or not scheduled" };

  await db.update(posts).set({ status: "publishing" }).where(eq(posts.id, post.id));

  try {
    const token = await db.query.linkedinTokens.findFirst({
      where: eq(linkedinTokens.userId, userId),
    });

    if (!token || token.status !== "active") {
      const isExpired = !token || token.tokenExpiry < new Date();
      if (token && isExpired) {
        await db.update(linkedinTokens).set({ status: "expired" }).where(eq(linkedinTokens.userId, userId));
      }
      await db
        .update(posts)
        .set({
          status: "failed",
          failureReason: "LinkedIn token expired. Please reconnect in Settings.",
        })
        .where(eq(posts.id, post.id));
      return { success: false, postId, error: "LinkedIn token expired. Please reconnect in Settings." };
    }

    const draft = await db.query.draftQueue.findFirst({
      where: eq(draftQueue.id, post.draftId),
    });
    const researchItem = draft?.researchItemId
      ? await db.query.researchItems.findFirst({
          where: eq(researchItems.id, draft.researchItemId),
        })
      : null;
    const articleUrl = draft?.sourceUrls?.[0] ?? null;
    const articleTitle = researchItem?.title ?? null;

    let result;
    try {
      result = await publishToLinkedIn({
        accessToken: token.accessToken,
        personUrn: token.personUrn,
        text: post.contentSnapshot,
        articleUrl,
        articleTitle,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      if (articleUrl && reason.toLowerCase().includes("article")) {
        result = await publishToLinkedIn({
          accessToken: token.accessToken,
          personUrn: token.personUrn,
          text: post.contentSnapshot,
          articleUrl: null,
        });
      } else {
        throw err;
      }
    }

    if (!result.success) {
      if (result.error === "TOKEN_EXPIRED") {
        await db.update(linkedinTokens).set({ status: "expired" }).where(eq(linkedinTokens.userId, userId));
      }
      await db
        .update(posts)
        .set({
          status: "failed",
          failureReason: result.error,
        })
        .where(eq(posts.id, post.id));
      return { success: false, postId, error: result.error };
    }

    await db
      .update(posts)
      .set({
        status: "published",
        linkedinPostId: result.postId,
        publishedAt: new Date(),
      })
      .where(eq(posts.id, post.id));

    await db.update(draftQueue).set({ status: "published" }).where(eq(draftQueue.id, post.draftId));

    return { success: true, postId };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await db
      .update(posts)
      .set({
        status: "failed",
        failureReason: reason,
      })
      .where(eq(posts.id, post.id));
    console.error(`Publish failed for post ${post.id}:`, error);
    return { success: false, postId, error: reason };
  }
}

export async function runPublishForDueUsers(): Promise<PublishCronResult> {
  let published = 0;
  let failed = 0;
  const errors: string[] = [];
  const settingsRows = await getUsersDueForPublishRun();

  for (const settings of settingsRows) {
    const due = await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.userId, settings.userId), eq(posts.status, "scheduled"), lte(posts.scheduledAt, new Date())));

    for (const post of due) {
      const result = await runPublishForPost(post.id, settings.userId);
      if (result.success) {
        published += 1;
      } else {
        failed += 1;
        if (result.error) errors.push(`Post ${post.id}: ${result.error}`);
      }
    }
  }

  return { published, failed, errors };
}

export async function logPublishRun(startTime: number, result: PublishCronResult) {
  await db
    .insert(cronRuns)
    .values({
      phase: "publish",
      durationMs: Date.now() - startTime,
      result,
      errorCount: result.failed,
      success: result.failed === 0,
    })
    .catch((err) => console.error("Failed to log cron run:", err));
}
