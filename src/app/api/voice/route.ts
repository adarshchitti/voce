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
    const body = (await request.json()) as { rawDescription?: string; samplePosts?: string[] };
    const samplePosts = body.samplePosts;
    const updates: Partial<typeof voiceProfiles.$inferInsert> = { updatedAt: new Date() };
    if (body.rawDescription !== undefined) updates.rawDescription = body.rawDescription;
    if (samplePosts !== undefined) {
      updates.samplePosts = samplePosts;
      updates.calibrated = samplePosts.length >= 3;
      if (samplePosts.length >= 3) updates.extractedPatterns = await extractVoicePatterns(samplePosts);
    }

    const existing = await db.query.voiceProfiles.findFirst({ where: eq(voiceProfiles.userId, userId) });
    if (existing) {
      await db.update(voiceProfiles).set(updates).where(eq(voiceProfiles.userId, userId));
    } else {
      await db.insert(voiceProfiles).values({ userId, rawDescription: updates.rawDescription ?? "", samplePosts: updates.samplePosts ?? [], extractedPatterns: updates.extractedPatterns, calibrated: updates.calibrated ?? false });
    }
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Failed to update voice profile" }, { status: 400 });
  }
}
