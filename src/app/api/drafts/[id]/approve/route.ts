import { and, eq } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { tasks } from "@trigger.dev/sdk/v3";
import { db } from "@/lib/db";
import { draftMemories, draftQueue, posts, researchItems, userSettings } from "@/lib/db/schema";
import { getAuthenticatedUser } from "@/lib/auth";
import { getSubscriptionStatus } from "@/lib/subscription";
import { calculateScheduledAt } from "@/lib/scheduler";
import type { publishPostTask } from "@/trigger/publish";

function inferStructure(text: string): string {
  if (text.match(/^\d+\./m)) return "numbered_list";
  if (text.match(/^[-•]/m)) return "bullet_list";
  if (text.match(/I (remember|was|learned|made|failed)/i)) return "personal_story";
  if (text.match(/\d+%|\d+ (out of|people|companies)/i)) return "data_point_hook";
  if (text.match(/\?/)) return "question_hook";
  return "direct_statement";
}

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");
  return new Anthropic({ apiKey });
}

async function generateEditDiffSummary(original: string, edited: string) {
  const client = getClient();
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 180,
    messages: [
      {
        role: "user",
        content: `In 1-2 sentences, describe what structurally changed between the original and edited version.
Focus on structure and tone changes, not content.
Original: ${original}
Edited: ${edited}`,
      },
    ],
  });
  return response.content[0]?.type === "text" ? response.content[0].text.trim() : null;
}

async function generateSeriesContextSummary(postText: string) {
  const client = getClient();
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 140,
    messages: [
      {
        role: "user",
        content: `Summarise this LinkedIn post in 40-60 words, capturing: the main argument or insight,
any specific examples or data points mentioned, and the tone. This summary will be used
to give context to the next post in the same series.
Post: ${postText}
Return plain text only, no JSON, no bullet points.`,
      },
    ],
  });
  return response.content[0]?.type === "text" ? response.content[0].text.trim() : null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, unauthorized } = await getAuthenticatedUser();
    if (unauthorized) return unauthorized;
    const { canPublish } = await getSubscriptionStatus(userId);
    if (!canPublish) {
      return Response.json(
        { error: "Subscription required", code: "SUBSCRIPTION_REQUIRED" },
        { status: 402 },
      );
    }
    const { id } = await params;
    const draft = await db.query.draftQueue.findFirst({ where: and(eq(draftQueue.id, id), eq(draftQueue.userId, userId), eq(draftQueue.status, "pending")) });
    if (!draft) return Response.json({ error: "Draft not found" }, { status: 404 });

    const settings = await db.query.userSettings.findFirst({ where: eq(userSettings.userId, userId) });
    if (!settings) return Response.json({ error: "Missing settings" }, { status: 400 });
    const requestBody = await request.json().catch(() => ({} as { scheduledAt?: string }));
    const customScheduledAt = requestBody?.scheduledAt ? new Date(requestBody.scheduledAt) : null;
    if (customScheduledAt && Number.isNaN(customScheduledAt.getTime())) {
      return Response.json({ error: "Invalid scheduledAt value" }, { status: 400 });
    }
    const scheduledAt =
      customScheduledAt ??
      calculateScheduledAt({
        preferredTime: settings.preferredTime,
        timezone: settings.timezone,
        jitterMinutes: settings.jitterMinutes,
        preferredDays: settings.preferredDays,
      });

    await db.update(draftQueue).set({ status: "approved", scheduledFor: scheduledAt }).where(and(eq(draftQueue.id, id), eq(draftQueue.userId, userId)));
    const [createdPost] = await db
      .insert(posts)
      .values({
        userId,
        draftId: id,
        contentSnapshot: draft.editedText ?? draft.draftText,
        status: "scheduled",
        scheduledAt,
      })
      .returning({ id: posts.id });

    await tasks.trigger<typeof publishPostTask>(
      "publish-post",
      {
        postId: createdPost.id,
        userId,
      },
      {
        delay: scheduledAt,
      },
    );

    let editDepthPct = 0;
    let editDiffSummary: string | null = null;
    if (draft.editedText && draft.editedText !== draft.draftText) {
      const originalWords = Math.max(1, draft.draftText.split(/\s+/).filter(Boolean).length);
      const editedWords = draft.editedText.split(/\s+/).filter(Boolean).length;
      const changedWords = Math.abs(originalWords - editedWords);
      editDepthPct = Math.min(100, Math.round((changedWords / originalWords) * 100));
      if (editDepthPct > 20) {
        editDiffSummary = await generateEditDiffSummary(draft.draftText, draft.editedText);
      }
    }

    const researchItem = draft.researchItemId
      ? await db.query.researchItems.findFirst({ where: eq(researchItems.id, draft.researchItemId) })
      : null;

    await db.insert(draftMemories).values({
      userId: draft.userId,
      draftId: draft.id,
      topicCluster: researchItem?.sourceType ?? null,
      structureUsed: inferStructure(draft.draftText),
      approved: true,
      hookFirstLine: draft.draftText.split("\n")[0]?.slice(0, 200) ?? "",
      wordCount: (draft.editedText ?? draft.draftText).split(/\s+/).filter(Boolean).length,
      editDiffSummary,
      editDepthPct,
    });

    if (draft.seriesId) {
      const summary = await generateSeriesContextSummary(draft.editedText ?? draft.draftText);
      if (summary) {
        await db
          .update(draftQueue)
          .set({ seriesContext: summary })
          .where(and(eq(draftQueue.id, id), eq(draftQueue.userId, userId)));
        // TODO(stage2-followup): also persist summary to posts.series_context once schema includes that column.
      }
    }
    return Response.json({ scheduledAt: scheduledAt.toISOString() });
  } catch (error) {
    console.error('Approve error:', error)
    return Response.json({ 
      error: "Failed to approve draft",
      detail: error instanceof Error ? error.message : String(error)
    }, { status: 400 })
  }
}
