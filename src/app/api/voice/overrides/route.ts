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
    };

    await db
      .update(voiceProfiles)
      .set({
        userBannedWords: body.userBannedWords ?? undefined,
        userNotes: body.userNotes ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(voiceProfiles.userId, userId)); // STAGE2: replace with supabase auth.uid()

    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Failed to update voice overrides" }, { status: 400 });
  }
}
