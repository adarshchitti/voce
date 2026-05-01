import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { voiceProfiles } from "@/lib/db/schema";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  FIELD_LIMITS,
  sanitiseBannedWords,
  sanitiseShortText,
  sanitiseToneMarkers,
} from "@/lib/sanitise";

const EMOJI_FREQUENCY_VALUES = ["none", "rare", "occasional", "frequent"] as const;

export async function PATCH(request: Request) {
  try {
    const { userId, unauthorized } = await getAuthenticatedUser();
    if (unauthorized) return unauthorized;
    const body = (await request.json()) as {
      userBannedWords?: string[];
      userNotes?: string;
      signaturePhrases?: string[];
      neverPatterns?: string[];
      postStructureTemplate?: string;
      emojiNeverOverride?: boolean;
      hookStyle?: string;
      paragraphStyle?: string;
      toneMarkers?: string[];
      emojiFrequency?: string;
    };

    const userBannedWords =
      body.userBannedWords !== undefined ? sanitiseBannedWords(body.userBannedWords) : undefined;
    const userNotes =
      body.userNotes !== undefined ? sanitiseShortText(body.userNotes, FIELD_LIMITS.userNotes) : undefined;

    const hookStyle =
      body.hookStyle !== undefined
        ? body.hookStyle.trim()
          ? sanitiseShortText(body.hookStyle, FIELD_LIMITS.hookStyle)
          : null
        : undefined;

    const paragraphStyle =
      body.paragraphStyle !== undefined
        ? body.paragraphStyle.trim()
          ? sanitiseShortText(body.paragraphStyle, FIELD_LIMITS.paragraphStyle)
          : null
        : undefined;

    const toneMarkers =
      body.toneMarkers !== undefined ? sanitiseToneMarkers(body.toneMarkers) : undefined;

    let extractedPatterns: Record<string, unknown> | undefined = undefined;
    if (body.emojiFrequency !== undefined) {
      if (
        typeof body.emojiFrequency !== "string" ||
        !EMOJI_FREQUENCY_VALUES.includes(body.emojiFrequency as (typeof EMOJI_FREQUENCY_VALUES)[number])
      ) {
        return Response.json({ error: "emojiFrequency must be none, rare, occasional, or frequent" }, { status: 400 });
      }
      const existing = await db.query.voiceProfiles.findFirst({ where: eq(voiceProfiles.userId, userId) });
      const prev = (existing?.extractedPatterns as Record<string, unknown> | null) ?? {};
      extractedPatterns = { ...prev, emojiFrequency: body.emojiFrequency };
    }

    await db
      .update(voiceProfiles)
      .set({
        userBannedWords: userBannedWords ?? undefined,
        userNotes: userNotes ?? undefined,
        signaturePhrases: body.signaturePhrases ?? undefined,
        neverPatterns: body.neverPatterns ?? undefined,
        postStructureTemplate: body.postStructureTemplate ?? undefined,
        emojiNeverOverride: body.emojiNeverOverride ?? undefined,
        hookStyle: hookStyle ?? undefined,
        paragraphStyle: paragraphStyle ?? undefined,
        toneMarkers: toneMarkers ?? undefined,
        updatedAt: new Date(),
        ...(extractedPatterns !== undefined ? { extractedPatterns } : {}),
      })
      .where(eq(voiceProfiles.userId, userId)); // STAGE2: replace with supabase auth.uid()

    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Failed to update voice overrides" }, { status: 400 });
  }
}
