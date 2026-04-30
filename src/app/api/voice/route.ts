import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { voiceProfiles } from "@/lib/db/schema";
import { getAuthenticatedUser } from "@/lib/auth";
import { extractVoicePatterns } from "@/lib/ai/extract-voice";

export async function GET() {
  try {
    const { userId, unauthorized } = await getAuthenticatedUser();
    if (unauthorized) return unauthorized;
    const voiceProfile = await db.query.voiceProfiles.findFirst({ where: eq(voiceProfiles.userId, userId) });
    return Response.json({ voiceProfile });
  } catch {
    return Response.json({ error: "Failed to fetch voice profile" }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  try {
    const { userId, unauthorized } = await getAuthenticatedUser();
    if (unauthorized) return unauthorized;
    const body = (await request.json()) as { rawDescription?: string; samplePosts?: string[]; personalContext?: string };
    const samplePosts = body.samplePosts ?? [];
    const existing = await db.query.voiceProfiles.findFirst({ where: eq(voiceProfiles.userId, userId) });
    const patterns =
      samplePosts.length >= 3
        ? await extractVoicePatterns(samplePosts, {
            userNotes: existing?.userNotes ?? "",
            userBannedWords: existing?.userBannedWords ?? [],
            toneMarkers: existing?.toneMarkers ?? [],
          })
        : null;
    const samplePostCount = samplePosts.length;
    const calibrationQuality =
      samplePostCount <= 2 ? "uncalibrated" : samplePostCount <= 5 ? "partial" : samplePostCount <= 7 ? "mostly" : "full";

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
        toneMarkers: existing?.toneMarkers ?? [],
        topicsObserved: patterns?.topicsObserved ?? [],
        formattingStyle: patterns?.formattingStyle ?? null,
        avgSentenceLengthWords: patterns?.avgSentenceLengthWords ?? null,
        sentenceLengthRange: patterns?.sentenceLengthRange ?? null,
        avgWordsPerPost: patterns?.avgWordsPerPost ?? null,
        passiveVoiceRate: patterns?.passiveVoiceRate ?? null,
        nominalizationRate: patterns?.nominalizationRate ?? null,
        hedgingPhrases: patterns?.hedgingPhrases ?? null,
        rhetoricalQuestionsRate: patterns?.rhetoricalQuestionsRate ?? null,
        personalAnecdoteRate: patterns?.personalAnecdoteRate ?? null,
        dataCitationRate: patterns?.dataCitationRate ?? null,
        paragraphStyle: patterns?.paragraphStyle ?? null,
        hookExamples: patterns?.hookExamples ?? null,
        neverPatterns: patterns?.neverPatterns ?? null,
        postStructureTemplate: patterns?.postStructureTemplate ?? null,
        signaturePhrases: patterns?.signaturePhrases ?? null,
        generationGuidance: patterns?.generationGuidance ?? null,
        samplePostCount,
        calibrationQuality,
        emojiContexts: patterns?.emojiContexts ?? null,
        emojiExamples: patterns?.emojiExamples ?? null,
        extractedPatterns: patterns,
        calibrated: samplePostCount >= 3,
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
          toneMarkers: existing?.toneMarkers ?? [],
          topicsObserved: patterns?.topicsObserved ?? [],
          formattingStyle: patterns?.formattingStyle ?? null,
          avgSentenceLengthWords: patterns?.avgSentenceLengthWords ?? null,
          sentenceLengthRange: patterns?.sentenceLengthRange ?? null,
          avgWordsPerPost: patterns?.avgWordsPerPost ?? null,
          passiveVoiceRate: patterns?.passiveVoiceRate ?? null,
          nominalizationRate: patterns?.nominalizationRate ?? null,
          hedgingPhrases: patterns?.hedgingPhrases ?? null,
          rhetoricalQuestionsRate: patterns?.rhetoricalQuestionsRate ?? null,
          personalAnecdoteRate: patterns?.personalAnecdoteRate ?? null,
          dataCitationRate: patterns?.dataCitationRate ?? null,
          paragraphStyle: patterns?.paragraphStyle ?? null,
          hookExamples: patterns?.hookExamples ?? null,
          neverPatterns: patterns?.neverPatterns ?? null,
          postStructureTemplate: patterns?.postStructureTemplate ?? null,
          signaturePhrases: patterns?.signaturePhrases ?? null,
          generationGuidance: patterns?.generationGuidance ?? null,
          samplePostCount,
          calibrationQuality,
          emojiContexts: patterns?.emojiContexts ?? null,
          emojiExamples: patterns?.emojiExamples ?? null,
          extractedPatterns: patterns,
          calibrated: samplePostCount >= 3,
          updatedAt: new Date(),
        },
      });
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Failed to update voice profile" }, { status: 400 });
  }
}
