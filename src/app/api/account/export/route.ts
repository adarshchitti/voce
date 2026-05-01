import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  contentSeries,
  draftMemories,
  draftQueue,
  posts,
  regenerationHistory,
  rejectionReasons,
  topicSubscriptions,
  userSettings,
  voiceProfiles,
} from "@/lib/db/schema";

export async function POST() {
  const { userId, unauthorized } = await getAuthenticatedUser();
  if (unauthorized) return unauthorized;

  const [drafts, userPosts, voiceProfile, topics, settings, rejections, memories, regenHistory, series] =
    await Promise.all([
      db.select().from(draftQueue).where(eq(draftQueue.userId, userId)),
      db.select().from(posts).where(eq(posts.userId, userId)),
      db.select().from(voiceProfiles).where(eq(voiceProfiles.userId, userId)),
      db.select().from(topicSubscriptions).where(eq(topicSubscriptions.userId, userId)),
      db.select().from(userSettings).where(eq(userSettings.userId, userId)),
      db.select().from(rejectionReasons).where(eq(rejectionReasons.userId, userId)),
      db.select().from(draftMemories).where(eq(draftMemories.userId, userId)),
      db.select().from(regenerationHistory).where(eq(regenerationHistory.userId, userId)),
      db.select().from(contentSeries).where(eq(contentSeries.userId, userId)),
    ]);

  const exportData = {
    exportedAt: new Date().toISOString(),
    userId,
    settings: settings[0] ?? null,
    voiceProfile: voiceProfile[0] ?? null,
    topics,
    drafts,
    posts: userPosts,
    rejectionReasons: rejections,
    draftMemories: memories,
    regenerationHistory: regenHistory,
    projects: series,
  };

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="voce-export-${new Date().toISOString().split("T")[0]}.json"`,
    },
  });
}
