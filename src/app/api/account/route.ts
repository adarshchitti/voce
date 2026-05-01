import { createClient } from "@supabase/supabase-js";
import { eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  contentSeries,
  draftMemories,
  draftQueue,
  linkedinTokens,
  posts,
  regenerationHistory,
  rejectionReasons,
  seriesTopicSubscriptions,
  topicSubscriptions,
  userSettings,
  voiceProfiles,
} from "@/lib/db/schema";

export async function DELETE() {
  const { userId, unauthorized } = await getAuthenticatedUser();
  if (unauthorized) return unauthorized;

  const userSeries = await db
    .select({ id: contentSeries.id })
    .from(contentSeries)
    .where(eq(contentSeries.userId, userId));

  if (userSeries.length > 0) {
    await db
      .delete(seriesTopicSubscriptions)
      .where(inArray(seriesTopicSubscriptions.seriesId, userSeries.map((s) => s.id)));
  }

  const userDrafts = await db
    .select({ id: draftQueue.id })
    .from(draftQueue)
    .where(eq(draftQueue.userId, userId));

  if (userDrafts.length > 0) {
    await db
      .delete(regenerationHistory)
      .where(inArray(regenerationHistory.draftId, userDrafts.map((d) => d.id)));
  }

  await db.delete(rejectionReasons).where(eq(rejectionReasons.userId, userId));
  await db.delete(draftMemories).where(eq(draftMemories.userId, userId));
  await db.delete(posts).where(eq(posts.userId, userId));
  await db.delete(draftQueue).where(eq(draftQueue.userId, userId));
  await db.delete(contentSeries).where(eq(contentSeries.userId, userId));
  await db.delete(topicSubscriptions).where(eq(topicSubscriptions.userId, userId));
  await db.delete(linkedinTokens).where(eq(linkedinTokens.userId, userId));
  await db.delete(voiceProfiles).where(eq(voiceProfiles.userId, userId));
  await db.delete(userSettings).where(eq(userSettings.userId, userId));

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { error } = await adminClient.auth.admin.deleteUser(userId);
  if (error) {
    console.error("Failed to delete auth user:", error);
  }

  return NextResponse.json({ success: true });
}
