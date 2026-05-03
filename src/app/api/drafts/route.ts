import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { contentSeries, draftQueue, researchItems, userSettings } from "@/lib/db/schema";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const { userId, unauthorized } = await getAuthenticatedUser();
    if (unauthorized) return unauthorized;
    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? "pending";
    const limit = Number(url.searchParams.get("limit") ?? "20");

    const drafts = await db
      .select({
        id: draftQueue.id,
        draftText: draftQueue.draftText,
        hook: draftQueue.hook,
        format: draftQueue.format,
        voiceScore: draftQueue.voiceScore,
        aiTellFlags: draftQueue.aiTellFlags,
        sourceUrls: draftQueue.sourceUrls,
        status: draftQueue.status,
        regenerationCount: draftQueue.regenerationCount,
        staleAfter: draftQueue.staleAfter,
        generatedAt: draftQueue.generatedAt,
        editedText: draftQueue.editedText,
        topicLabel: draftQueue.topicLabel,
        seriesId: draftQueue.seriesId,
        seriesPosition: draftQueue.seriesPosition,
        seriesContext: draftQueue.seriesContext,
        seriesTitle: contentSeries.title,
        researchTitle: researchItems.title,
        researchUrl: researchItems.url,
        researchSummary: researchItems.summary,
        researchSourceType: researchItems.sourceType,
        researchPublishedAt: researchItems.publishedAt,
      })
      .from(draftQueue)
      .leftJoin(researchItems, eq(draftQueue.researchItemId, researchItems.id))
      .leftJoin(contentSeries, eq(draftQueue.seriesId, contentSeries.id))
      .where(and(eq(draftQueue.userId, userId), eq(draftQueue.status, status)))
      .orderBy(desc(draftQueue.generatedAt))
      .limit(limit);

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const quickCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(draftQueue)
      .where(
        and(
          eq(draftQueue.userId, userId),
          eq(draftQueue.source, "quick_generate"),
          gte(draftQueue.generatedAt, todayStart),
        ),
      );

    const quickGenerateRemaining = Math.max(0, 3 - (quickCount[0]?.count ?? 0));

    const settingsRow = await db
      .select({ lastCronStatus: userSettings.lastCronStatus, lastCronAt: userSettings.lastCronAt })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);
    const lastCronStatus = settingsRow[0]?.lastCronStatus ?? null;
    const lastCronAt = settingsRow[0]?.lastCronAt ? settingsRow[0].lastCronAt.toISOString() : null;

    return Response.json({
      drafts: drafts.map((d) => ({
        id: d.id,
        draftText: d.draftText,
        hook: d.hook,
        format: d.format,
        voiceScore: d.voiceScore,
        aiTellFlags: d.aiTellFlags,
        sourceUrls: d.sourceUrls ?? [],
        status: d.status,
        regenerationCount: d.regenerationCount,
        staleAfter: d.staleAfter.toISOString(),
        generatedAt: d.generatedAt.toISOString(),
        editedText: d.editedText,
        topicLabel: d.topicLabel ?? null,
        seriesId: d.seriesId,
        seriesPosition: d.seriesPosition,
        seriesContext: d.seriesContext,
        seriesTitle: d.seriesTitle ?? null,
        researchItem: d.researchTitle
          ? {
              title: d.researchTitle,
              url: d.researchUrl!,
              summary: d.researchSummary ?? "",
              sourceType: d.researchSourceType!,
              publishedAt: d.researchPublishedAt ? d.researchPublishedAt.toISOString() : null,
            }
          : null,
      })),
      quickGenerateRemaining,
      lastCronStatus,
      lastCronAt,
    });
  } catch {
    return Response.json({ error: "Failed to fetch drafts" }, { status: 400 });
  }
}
