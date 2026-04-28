import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { voiceProfiles } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";

export async function PATCH(request: Request) {
  try {
    const userId = await requireAuth();
    const body = (await request.json()) as {
      userBannedWords?: string[];
      userNotes?: string;
      signaturePhrases?: string[];
      neverPatterns?: string[];
      postStructureTemplate?: string;
      emojiNeverOverride?: boolean;
    };

    await db
      .update(voiceProfiles)
      .set({
        userBannedWords: body.userBannedWords ?? undefined,
        userNotes: body.userNotes ?? undefined,
        signaturePhrases: body.signaturePhrases ?? undefined,
        neverPatterns: body.neverPatterns ?? undefined,
        postStructureTemplate: body.postStructureTemplate ?? undefined,
        emojiNeverOverride: body.emojiNeverOverride ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(voiceProfiles.userId, userId)); // STAGE2: replace with supabase auth.uid()

    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Failed to update voice overrides" }, { status: 400 });
  }
}
