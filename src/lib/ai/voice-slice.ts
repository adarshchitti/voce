import type { InferSelectModel } from "drizzle-orm";
import type { voiceProfiles } from "@/lib/db/schema";

type VoiceProfile = InferSelectModel<typeof voiceProfiles>;

export type VoicePromptSlice = {
  sentenceLength: VoiceProfile["sentenceLength"];
  hookStyle: VoiceProfile["hookStyle"];
  pov: VoiceProfile["pov"];
  toneMarkers: VoiceProfile["toneMarkers"];
  formattingStyle: VoiceProfile["formattingStyle"];
  paragraphStyle: VoiceProfile["paragraphStyle"];
  postStructureTemplate: VoiceProfile["postStructureTemplate"];
  signaturePhrases: VoiceProfile["signaturePhrases"];
  generationGuidance: VoiceProfile["generationGuidance"];
  emojiContexts: VoiceProfile["emojiContexts"];
  emojiExamples: VoiceProfile["emojiExamples"];
  emojiNeverOverride: VoiceProfile["emojiNeverOverride"];
  emojiFrequency: string | null;
  tellFlagEmDash: boolean | null;
  userBannedWords: VoiceProfile["userBannedWords"];
  userNotes: VoiceProfile["userNotes"];
  extractedPatterns: unknown;
};

export function buildVoicePromptSlice(
  voiceProfile: VoiceProfile | null | undefined,
  settings?: { tellFlagEmDash?: boolean | null } | null,
): VoicePromptSlice {
  const emojiFrequency =
    (voiceProfile?.extractedPatterns as { emojiFrequency?: string } | null | undefined)?.emojiFrequency ?? null;
  return {
    sentenceLength: voiceProfile?.sentenceLength ?? null,
    hookStyle: voiceProfile?.hookStyle ?? null,
    pov: voiceProfile?.pov ?? null,
    toneMarkers: voiceProfile?.toneMarkers ?? null,
    formattingStyle: voiceProfile?.formattingStyle ?? null,
    paragraphStyle: voiceProfile?.paragraphStyle ?? null,
    postStructureTemplate: voiceProfile?.postStructureTemplate ?? null,
    signaturePhrases: voiceProfile?.signaturePhrases ?? null,
    generationGuidance: voiceProfile?.generationGuidance ?? null,
    emojiContexts: voiceProfile?.emojiContexts ?? null,
    emojiExamples: voiceProfile?.emojiExamples ?? null,
    emojiNeverOverride: voiceProfile?.emojiNeverOverride ?? null,
    emojiFrequency,
    tellFlagEmDash: settings?.tellFlagEmDash ?? null,
    userBannedWords: voiceProfile?.userBannedWords ?? null,
    userNotes: voiceProfile?.userNotes ?? null,
    extractedPatterns: voiceProfile?.extractedPatterns ?? {},
  };
}
