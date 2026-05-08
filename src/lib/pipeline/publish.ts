import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { cronRuns, draftQueue, linkedinTokens, posts } from "@/lib/db/schema";
import { publishToLinkedIn } from "@/lib/linkedin/publish";

export type ClaimedPost = {
  id: string;
  userId: string;
  draftId: string;
  contentSnapshot: string;
  linkedinPostId: string | null;
  scheduledAt: Date;
  attempts: number;
};

export type PublishSingleResult = {
  success: boolean;
  postId: string;
  reason?: string;
  alreadyPublished?: boolean;
};

export type PublishSweepResult = {
  claimed: number;
  published: number;
  failed: number;
  zombiesReset: number;
  zombiesFailed: number;
  errors: string[];
};

const MAX_ATTEMPTS = 3;

export async function runPublishForPost(
  post: ClaimedPost,
  userId: string,
): Promise<PublishSingleResult> {
  if (post.linkedinPostId) {
    return { success: true, postId: post.id, alreadyPublished: true };
  }

  try {
    const token = await db.query.linkedinTokens.findFirst({
      where: eq(linkedinTokens.userId, userId),
    });

    const tokenExpired = !!token && token.tokenExpiry < new Date();
    if (!token || token.status !== "active" || tokenExpired) {
      if (token && tokenExpired) {
        await db
          .update(linkedinTokens)
          .set({ status: "expired" })
          .where(eq(linkedinTokens.userId, userId));
      }
      const reason = "LinkedIn token missing/expired";
      await db
        .update(posts)
        .set({ status: "failed", failureReason: reason, claimedAt: null })
        .where(and(eq(posts.id, post.id), eq(posts.status, "publishing")));
      return { success: false, postId: post.id, reason };
    }

    const result = await publishToLinkedIn({
      accessToken: token.accessToken,
      personUrn: token.personUrn,
      text: post.contentSnapshot,
      idempotencyKey: post.id,
    });

    if (!result.success) {
      if (result.error === "TOKEN_EXPIRED") {
        await db
          .update(linkedinTokens)
          .set({ status: "expired" })
          .where(eq(linkedinTokens.userId, userId));
      }
      await db
        .update(posts)
        .set({ status: "failed", failureReason: result.error, claimedAt: null })
        .where(and(eq(posts.id, post.id), eq(posts.status, "publishing")));
      return { success: false, postId: post.id, reason: result.error };
    }

    await db
      .update(posts)
      .set({
        status: "published",
        publishedAt: new Date(),
        linkedinPostId: result.postId,
        claimedAt: null,
      })
      .where(and(eq(posts.id, post.id), eq(posts.status, "publishing")));
    await db
      .update(draftQueue)
      .set({ status: "published" })
      .where(eq(draftQueue.id, post.draftId));

    return { success: true, postId: post.id };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await db
      .update(posts)
      .set({ status: "failed", failureReason: reason, claimedAt: null })
      .where(and(eq(posts.id, post.id), eq(posts.status, "publishing")));
    console.error(`Publish failed for post ${post.id}:`, error);
    return { success: false, postId: post.id, reason };
  }
}

export async function runPublishSweep(opts?: {
  batchSize?: number;
  zombieTimeoutMs?: number;
}): Promise<PublishSweepResult> {
  const batchSize = opts?.batchSize ?? 20;
  const zombieTimeoutMs = opts?.zombieTimeoutMs ?? 15 * 60 * 1000;

  // Step A: zombie cleanup. Rows stuck in 'publishing' past the timeout are
  // either reset (attempts < MAX) or terminally failed (attempts >= MAX).
  const resetResult = await db.execute(sql`
    UPDATE posts
    SET status = 'scheduled', claimed_at = NULL
    WHERE status = 'publishing'
      AND claimed_at < now() - (${zombieTimeoutMs} || ' milliseconds')::interval
      AND attempts < ${MAX_ATTEMPTS}
  `);
  const zombiesReset = resetResult.count ?? 0;

  const failedResult = await db.execute(sql`
    UPDATE posts
    SET status = 'failed',
        failure_reason = 'exceeded retry limit (zombie)',
        claimed_at = NULL
    WHERE status = 'publishing'
      AND claimed_at < now() - (${zombieTimeoutMs} || ' milliseconds')::interval
      AND attempts >= ${MAX_ATTEMPTS}
  `);
  const zombiesFailed = failedResult.count ?? 0;

  // Step B: atomic claim using FOR UPDATE SKIP LOCKED. This is the
  // industry-standard database-as-queue pattern (Sidekiq reliable fetch,
  // River, Que, pgmq).
  const claimRows = await db.execute(sql`
    UPDATE posts
    SET status = 'publishing',
        claimed_at = now(),
        attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM posts
      WHERE status = 'scheduled' AND scheduled_at <= now()
      ORDER BY scheduled_at ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, user_id, draft_id, content_snapshot, linkedin_post_id,
              scheduled_at, attempts
  `);

  const claimed: ClaimedPost[] = (claimRows as unknown as Array<{
    id: string;
    user_id: string;
    draft_id: string;
    content_snapshot: string;
    linkedin_post_id: string | null;
    scheduled_at: Date;
    attempts: number;
  }>).map((row) => ({
    id: row.id,
    userId: row.user_id,
    draftId: row.draft_id,
    contentSnapshot: row.content_snapshot,
    linkedinPostId: row.linkedin_post_id,
    scheduledAt: row.scheduled_at,
    attempts: row.attempts,
  }));

  // Step C: per-row publish. One poison pill must not kill the batch.
  let published = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const post of claimed) {
    try {
      const result = await runPublishForPost(post, post.userId);
      if (result.success) {
        published += 1;
      } else {
        failed += 1;
        if (result.reason) errors.push(`Post ${post.id}: ${result.reason}`);
      }
    } catch (err) {
      failed += 1;
      const reason = err instanceof Error ? err.message : String(err);
      errors.push(`Post ${post.id}: ${reason}`);
      console.error(`Unhandled error in sweep for post ${post.id}:`, err);
    }
  }

  return {
    claimed: claimed.length,
    published,
    failed,
    zombiesReset,
    zombiesFailed,
    errors,
  };
}

export async function logPublishSweep(startTime: number, result: PublishSweepResult) {
  await db
    .insert(cronRuns)
    .values({
      phase: "publish-sweep",
      durationMs: Date.now() - startTime,
      result,
      errorCount: result.failed + result.zombiesFailed,
      success: result.failed === 0 && result.zombiesFailed === 0,
    })
    .catch((err) => console.error("Failed to log cron run:", err));
}
