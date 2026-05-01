import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { voiceProfiles } from "@/lib/db/schema";
import { getAuthenticatedUser } from "@/lib/auth";
import { extractVoicePatterns } from "@/lib/ai/extract-voice";
import {
  FIELD_LIMITS,
  isValidSamplePost,
  sanitiseBannedWords,
  sanitiseSamplePost,
  sanitiseShortText,
} from "@/lib/sanitise";

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
    const body = (await request.json()) as {
      rawDescription?: string;
      samplePosts?: string[];
      personalContext?: string;
      userNotes?: string;
      userBannedWords?: string[];
    };
    const rawPosts = body.samplePosts ?? [];
    const sanitisedPosts = rawPosts.map((p: string) => sanitiseSamplePost(p)).filter((p: string) => isValidSamplePost(p));

    if (sanitisedPosts.length === 0 && rawPosts.length > 0) {
      return Response.json(
        { error: "No valid posts found. Each post must be at least 100 characters." },
        { status: 400 },
      );
    }

    const samplePosts = sanitisedPosts;
    const rawDescription = body.rawDescription?.trim()
      ? sanitiseShortText(body.rawDescription, FIELD_LIMITS.samplePost)
      : null;
    const personalContext = body.personalContext?.trim()
      ? sanitiseShortText(body.personalContext, FIELD_LIMITS.personalContext)
      : null;
    const userNotes = body.userNotes !== undefined ? sanitiseShortText(body.userNotes, FIELD_LIMITS.userNotes) : undefined;
    const userBannedWords =
      body.userBannedWords !== undefined ? sanitiseBannedWords(body.userBannedWords) : undefined;

    const existing = await db.query.voiceProfiles.findFirst({ where: eq(voiceProfiles.userId, userId) });
    const patterns =
      samplePosts.length >= 3
        ? await extractVoicePatterns(samplePosts, {
            userNotes: userNotes ?? existing?.userNotes ?? "",
            userBannedWords: userBannedWords ?? existing?.userBannedWords ?? [],
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
        rawDescription,
        samplePosts,
        personalContext,
        sentenceLength: patterns?.sentenceLength ?? null,
        hookStyle: patterns?.hookStyle ?? null,
        pov: patterns?.pov ?? null,
        toneMarkers: existing?.toneMarkers ?? [],
        userNotes: userNotes ?? existing?.userNotes ?? null,
        userBannedWords: userBannedWords ?? existing?.userBannedWords ?? [],
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
          rawDescription,
          samplePosts,
          personalContext,
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
          ...(body.userNotes !== undefined ? { userNotes } : {}),
          ...(body.userBannedWords !== undefined ? { userBannedWords } : {}),
        },
      });
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Failed to update voice profile" }, { status: 400 });
  }
}
