import { db } from "@/lib/db";
import { posts, draftQueue, linkedinTokens, cronRuns, researchItems } from "@/lib/db/schema";
import { eq, and, lte } from "drizzle-orm";
import { USER_ID } from "@/lib/constants";
import { publishToLinkedIn } from "@/lib/linkedin/publish";
import { getCronSecret } from "@/lib/linkedin/oauth";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${getCronSecret()}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  let published = 0;
  let failed = 0;
  const errors: string[] = [];

  try {
    // Find all scheduled posts due for publishing
    const due = await db
      .select()
      .from(posts)
      .where(and(eq(posts.userId, USER_ID), eq(posts.status, "scheduled"), lte(posts.scheduledAt, new Date())));

    for (const post of due) {
      // Set to 'publishing' to prevent double-publish on cron overlap
      await db.update(posts).set({ status: "publishing" }).where(eq(posts.id, post.id));

      try {
        const token = await db.query.linkedinTokens.findFirst({
          where: eq(linkedinTokens.userId, USER_ID),
        });

        if (!token || token.status !== "active") {
          const isExpired = !token || token.tokenExpiry < new Date();
          if (token && isExpired) {
            await db.update(linkedinTokens).set({ status: "expired" }).where(eq(linkedinTokens.userId, USER_ID));
          }
          await db
            .update(posts)
            .set({
              status: "failed",
              failureReason: "LinkedIn token expired. Please reconnect in Settings.",
            })
            .where(eq(posts.id, post.id));
          failed++;
          continue;
        }

        // Get source URL from associated draft
        const draft = await db.query.draftQueue.findFirst({
          where: eq(draftQueue.id, post.draftId),
        });
        const researchItem = draft?.researchItemId
          ? await db.query.researchItems.findFirst({
              where: eq(researchItems.id, draft.researchItemId)
            })
          : null
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
          // If article attachment caused the failure, retry without it
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
          // Handle token expiry detected at publish time
          if (result.error === "TOKEN_EXPIRED") {
            await db.update(linkedinTokens).set({ status: "expired" }).where(eq(linkedinTokens.userId, USER_ID));
          }
          await db
            .update(posts)
            .set({
              status: "failed",
              failureReason: result.error,
            })
            .where(eq(posts.id, post.id));
          failed++;
          errors.push(`Post ${post.id}: ${result.error}`);
          continue;
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

        published++;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        await db
          .update(posts)
          .set({
            status: "failed",
            failureReason: reason,
          })
          .where(eq(posts.id, post.id));
        failed++;
        errors.push(`Post ${post.id}: ${reason}`);
        console.error(`Publish failed for post ${post.id}:`, error);
      }
    }
  } catch (error) {
    console.error("Publish cron error:", error);
  }

  const result = { published, failed, errors };

  // Log to cron_runs
  await db
    .insert(cronRuns)
    .values({
      phase: "publish",
      durationMs: Date.now() - startTime,
      result,
      errorCount: failed,
      success: failed === 0,
    })
    .catch((err) => console.error("Failed to log cron run:", err));

  return Response.json(result);
}

// Vercel crons always use GET
export const POST = GET;
