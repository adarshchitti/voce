import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { voiceProfiles } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";
import { extractVoicePatterns } from "@/lib/ai/extract-voice";

export async function GET() {
  try {
    const userId = await requireAuth();
    const voiceProfile = await db.query.voiceProfiles.findFirst({ where: eq(voiceProfiles.userId, userId) });
    return Response.json({ voiceProfile });
  } catch {
    return Response.json({ error: "Failed to fetch voice profile" }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  try {
    const userId = await requireAuth();
    const body = (await request.json()) as { rawDescription?: string; samplePosts?: string[]; personalContext?: string };
    const samplePosts = body.samplePosts ?? [];
    const patterns = samplePosts.length >= 3 ? await extractVoicePatterns(samplePosts) : null;

    await db
      .insert(voiceProfiles)
      .values({
        userId, // STAGE2: replace with supabase auth.uid()
        rawDescription: body.rawDescription ?? null,
        samplePosts,
        personalContext: body.personalContext ?? null,
        sentenceLength: patterns?.sentenceLength ?? null,
        hookStyle: patterns?.hookStyle ?? null,
        pov: patterns?.pov ?? null,
        toneMarkers: patterns?.toneMarkers ?? [],
        topicsObserved: patterns?.topicsObserved ?? [],
        formattingStyle: patterns?.formattingStyle ?? null,
        extractedPatterns: patterns,
        calibrated: samplePosts.length >= 3,
      })
      .onConflictDoUpdate({
        target: voiceProfiles.userId,
        set: {
          rawDescription: body.rawDescription ?? null,
          samplePosts,
          personalContext: body.personalContext ?? null,
          sentenceLength: patterns?.sentenceLength ?? null,
          hookStyle: patterns?.hookStyle ?? null,
          pov: patterns?.pov ?? null,
          toneMarkers: patterns?.toneMarkers ?? [],
          topicsObserved: patterns?.topicsObserved ?? [],
          formattingStyle: patterns?.formattingStyle ?? null,
          extractedPatterns: patterns,
          calibrated: samplePosts.length >= 3,
          updatedAt: new Date(),
        },
      });
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Failed to update voice profile" }, { status: 400 });
  }
}
