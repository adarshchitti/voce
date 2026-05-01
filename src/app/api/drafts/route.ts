import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { contentSeries, draftQueue, researchItems } from "@/lib/db/schema";
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
    });
  } catch {
    return Response.json({ error: "Failed to fetch drafts" }, { status: 400 });
  }
}
