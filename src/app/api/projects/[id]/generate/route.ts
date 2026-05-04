import Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  contentSeries,
  draftMemories,
  draftQueue,
  posts,
  rejectionReasons,
  researchItems,
  seriesTopicSubscriptions,
  topicSubscriptions,
  userSettings,
  voiceProfiles,
} from "@/lib/db/schema";
import { getAuthenticatedUser } from "@/lib/auth";
import { getSubscriptionStatus } from "@/lib/subscription";
import { fetchTavilyItems } from "@/lib/ai/tavily";
import { generateDraft } from "@/lib/ai/generate-draft";
import { buildProjectContext } from "@/lib/ai/prompts";
import type { RuleContext } from "@/lib/ai/quality-rules";
import { scanDraftForAITells, serializeAiTellFlags } from "@/lib/ai/scan-draft";
import { selectStructureTemplate } from "@/lib/ai/structure-templates";
import { getMatchedPriorityWeight, getPriorityAdjustedScore } from "@/lib/ai/rank-research";

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");
  return new Anthropic({ apiKey });
}

async function scoreProjectRelevance(input: {
  goal: string | null;
  projectTopics: string[];
  postTypePreferences: string[];
  title: string;
  summary: string;
}) {
  const client = getClient();
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 180,
    messages: [
      {
        role: "user",
        content: `Rate how relevant this research item is for a LinkedIn post in this project.
Project goal: ${input.goal ?? "None"}
Project topics: ${input.projectTopics.join(", ") || "None"}
Preferred post types: ${input.postTypePreferences.join(", ") || "None"}
Research item title: ${input.title}
Research item summary: ${input.summary}
Return JSON: { "relevance_score": 0.0-1.0, "recommended_post_type": "thought_leadership|personal_story|build_in_public|tutorial_explainer|industry_news_take|data_insight|tool_review" }`,
      },
    ],
  });
  const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
  const clean = text.replace(/```json\n?|```\n?/g, "").trim();
  const parsed = JSON.parse(clean) as { relevance_score?: number; recommended_post_type?: string };
  return {
    relevanceScore: Math.max(0, Math.min(1, Number(parsed.relevance_score ?? 0))),
    recommendedPostType: parsed.recommended_post_type ?? null,
  };
}

function looksRelatedToTopics(input: { title: string; summary: string | null; topics: string[] }) {
  if (!input.topics.length) return true;
  const haystack = `${input.title} ${input.summary ?? ""}`.toLowerCase();
  return input.topics.some((topic) =>
    topic
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .some((token) => token.length > 2 && haystack.includes(token)),
  );
}

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
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
    const { id: projectId } = await params;

    const project = await db.query.contentSeries.findFirst({
      where: and(eq(contentSeries.id, projectId), eq(contentSeries.userId, userId)),
    });
    if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

    const linkedTopics = await db
      .select({
        topicSubscriptionId: topicSubscriptions.id,
        topicLabel: topicSubscriptions.topicLabel,
        tavilyQuery: topicSubscriptions.tavilyQuery,
        priorityWeight: seriesTopicSubscriptions.priorityWeight,
      })
      .from(seriesTopicSubscriptions)
      .innerJoin(topicSubscriptions, eq(seriesTopicSubscriptions.topicSubscriptionId, topicSubscriptions.id))
      .innerJoin(contentSeries, eq(seriesTopicSubscriptions.seriesId, contentSeries.id))
      .where(and(eq(seriesTopicSubscriptions.seriesId, projectId), eq(contentSeries.userId, userId)));

    const candidates = await db.select().from(researchItems).orderBy(desc(researchItems.fetchedAt)).limit(200);
    const pool = candidates.filter((item) =>
      looksRelatedToTopics({
        title: item.title,
        summary: item.summary,
        topics: [
          ...(project.projectTopics ?? []),
          ...linkedTopics.map((topic) => topic.topicLabel),
        ],
      }),
    );

    const scoredPool = await Promise.all(
      pool.map(async (item) => ({
        item,
        priorityWeight: getMatchedPriorityWeight({
          title: item.title,
          summary: item.summary,
          linkedTopics: linkedTopics.map((topic) => ({ topicLabel: topic.topicLabel, priorityWeight: topic.priorityWeight })),
        }),
        ...(await scoreProjectRelevance({
          goal: project.goal,
          projectTopics: project.projectTopics ?? [],
          postTypePreferences: project.postTypePreferences ?? [],
          title: item.title,
          summary: item.summary ?? "",
        })),
      })),
    );
    const sortedPool = scoredPool.sort(
      (a, b) =>
        getPriorityAdjustedScore({
          relevanceScore: a.item.relevanceScore ? Number(a.item.relevanceScore) : a.relevanceScore,
          originalityScore: a.item.originalityScore ? Number(a.item.originalityScore) : 0,
          topicPriorityWeight: a.priorityWeight,
        }) <
        getPriorityAdjustedScore({
          relevanceScore: b.item.relevanceScore ? Number(b.item.relevanceScore) : b.relevanceScore,
          originalityScore: b.item.originalityScore ? Number(b.item.originalityScore) : 0,
          topicPriorityWeight: b.priorityWeight,
        })
          ? 1
          : -1,
    );
    let topItems = sortedPool.slice(0, 3);
    let fallbackUsed = false;

    if (!topItems.length || topItems[0].relevanceScore < 0.4) {
      fallbackUsed = true;
      const queryParts = [
        ...(project.projectTopics ?? []),
        ...linkedTopics.map((topic) => topic.tavilyQuery),
      ].filter(Boolean);
      const query = queryParts.join(" OR ");
      const freshResults = query ? await fetchTavilyItems(query, "news") : [];
      if (freshResults.length) {
        await db
          .insert(researchItems)
          .values(
            freshResults.map((result) => ({
              url: result.url,
              title: result.title,
              summary: result.summary,
              sourceType: "project_search",
              publishedAt: result.publishedAt,
              dedupHash: result.dedupHash,
            })),
          )
          .onConflictDoNothing({ target: researchItems.dedupHash });
      }

      const rescored = await Promise.all(
        freshResults.map(async (item) => ({
          item,
          ...(await scoreProjectRelevance({
            goal: project.goal,
            projectTopics: project.projectTopics ?? [],
            postTypePreferences: project.postTypePreferences ?? [],
            title: item.title,
            summary: item.summary ?? "",
          })),
        })),
      );
      const bestFresh = rescored.sort((a, b) => b.relevanceScore - a.relevanceScore)[0];
      if (!bestFresh || bestFresh.relevanceScore < 0.4) {
        return Response.json(
          { error: "No relevant research found for this project right now. Try again tomorrow or add more topics." },
          { status: 404 },
        );
      }
      const matched = await db.query.researchItems.findFirst({
        where: eq(researchItems.dedupHash, bestFresh.item.dedupHash),
      });
      if (!matched) return Response.json({ error: "Failed to load project research item" }, { status: 400 });
      topItems = [
        {
          item: matched,
          relevanceScore: bestFresh.relevanceScore,
          recommendedPostType: bestFresh.recommendedPostType,
          priorityWeight: 3,
        },
      ];
    }

    const topResearch = topItems[0].item;
    const [publishedCountRow] = await db
      .select({ value: sql<number>`count(*)` })
      .from(posts)
      .innerJoin(contentSeries, eq(posts.seriesId, contentSeries.id))
      .where(and(eq(posts.seriesId, projectId), eq(posts.status, "published"), eq(contentSeries.userId, userId)));
    const postsPublished = Number(publishedCountRow?.value ?? 0);
    const seriesPosition = postsPublished + 1;

    const lastPublishedDraft = await db.query.draftQueue.findFirst({
      where: and(eq(draftQueue.userId, userId), eq(draftQueue.seriesId, projectId), eq(draftQueue.status, "published")),
      orderBy: [desc(draftQueue.seriesPosition)],
    });
    const previousPostContext = lastPublishedDraft?.seriesContext ?? null;
    const projectContext = buildProjectContext({
      project,
      seriesPosition,
      postsPublished,
      previousPostContext,
    });

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
    const topicCluster = topResearch.sourceType ?? "general";
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
      tellFlagEmDash: settings?.tellFlagEmDash ?? true,
      userBannedWords: voiceProfile?.userBannedWords,
      userNotes: voiceProfile?.userNotes,
      extractedPatterns: voiceProfile?.extractedPatterns ?? {},
      rawDescription: voiceProfile?.rawDescription ?? "",
      title: topResearch.title,
      summary: topResearch.summary ?? "",
      url: topResearch.url,
      rejections: recentRejections,
      projectContext,
      structureTemplate,
      relevantMemories,
      rulesManifest: null,
    });

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
    const scanResult = scanDraftForAITells(generated.draftText, scanContext, {
      recentMemories: relevantMemories,
    });

    const isRecentNews =
      topResearch.sourceType === "tavily_news" ||
      (!!topResearch.publishedAt && Date.now() - topResearch.publishedAt.getTime() <= 48 * 60 * 60 * 1000);
    const [draft] = await db
      .insert(draftQueue)
      .values({
        userId,
        researchItemId: topResearch.id,
        draftText: scanResult.draftText,
        hook: generated.hook,
        format: generated.format,
        hashtags: generated.hashtags ?? [],
        sourceUrls: [topResearch.url],
        aiTellFlags: serializeAiTellFlags(scanResult),
        status: "pending",
        seriesId: projectId,
        seriesPosition,
        staleAfter: new Date(Date.now() + (isRecentNews ? 72 : 24 * 7) * 60 * 60 * 1000),
        structureTemplateId: structureTemplate.id,
      })
      .returning();

    return Response.json({
      draftId: draft.id,
      seriesPosition,
      researchItemTitle: topResearch.title,
      fallbackUsed,
    });
  } catch {
    return Response.json({ error: "Failed to generate project draft" }, { status: 400 });
  }
}

