import { describe, expect, it } from "vitest";
import { buildVoicePromptSlice } from "@/lib/ai/voice-slice";

const fixtureVoiceProfile = {
  id: "00000000-0000-0000-0000-000000000001",
  userId: "test-user",
  rawDescription: "I write about distributed systems with a dry sense of humor.",
  samplePosts: [],
  sentenceLength: "medium",
  hookStyle: "data_point",
  pov: "first_person_singular",
  toneMarkers: ["direct", "data-driven"],
  topicsObserved: ["distributed systems"],
  formattingStyle: "emoji_light",
  userBannedWords: ["leverage", "synergy"],
  userNotes: "Never end with a question.",
  personalContext: null,
  extractedPatterns: { emojiFrequency: "rare" },
  calibrated: true,
  avgSentenceLengthWords: 14,
  sentenceLengthRange: "6-22",
  avgWordsPerPost: 180,
  passiveVoiceRate: "~5% of sentences",
  nominalizationRate: "low",
  hedgingPhrases: ["I think"],
  rhetoricalQuestionsRate: "0.10",
  personalAnecdoteRate: "0.40",
  dataCitationRate: "0.30",
  paragraphStyle: "two_three_lines",
  hookExamples: ["This is wrong."],
  neverPatterns: ["never ends with a CTA"],
  postStructureTemplate: "Open with one bold statement. Develop with 2-3 short paragraphs. Close with a takeaway.",
  signaturePhrases: ["worth noting", "real talk"],
  generationGuidance: "Use varied sentence length. Cite a specific data point. End on the takeaway.",
  calibrationQuality: "full",
  samplePostCount: 30,
  emojiContexts: ["sentence_starter"],
  emojiExamples: ["→"],
  emojiNeverOverride: false,
  updatedAt: new Date("2026-04-01T00:00:00Z"),
} as Parameters<typeof buildVoicePromptSlice>[0];

describe("buildVoicePromptSlice", () => {
  it("returns the 16-field slice for a fully populated voice profile (regression snapshot for quick generate)", () => {
    expect(buildVoicePromptSlice(fixtureVoiceProfile)).toMatchInlineSnapshot(`
      {
        "emojiContexts": [
          "sentence_starter",
        ],
        "emojiExamples": [
          "→",
        ],
        "emojiFrequency": "rare",
        "emojiNeverOverride": false,
        "extractedPatterns": {
          "emojiFrequency": "rare",
        },
        "formattingStyle": "emoji_light",
        "generationGuidance": "Use varied sentence length. Cite a specific data point. End on the takeaway.",
        "hookStyle": "data_point",
        "paragraphStyle": "two_three_lines",
        "postStructureTemplate": "Open with one bold statement. Develop with 2-3 short paragraphs. Close with a takeaway.",
        "pov": "first_person_singular",
        "sentenceLength": "medium",
        "signaturePhrases": [
          "worth noting",
          "real talk",
        ],
        "toneMarkers": [
          "direct",
          "data-driven",
        ],
        "userBannedWords": [
          "leverage",
          "synergy",
        ],
        "userNotes": "Never end with a question.",
      }
    `);
  });

  it("falls back to nulls / empty extractedPatterns for null voice profile", () => {
    const slice = buildVoicePromptSlice(null);
    expect(slice.sentenceLength).toBeNull();
    expect(slice.emojiFrequency).toBeNull();
    expect(slice.extractedPatterns).toEqual({});
  });

  it("does not include rawDescription (callers set it; cron and quick differ on it)", () => {
    const slice = buildVoicePromptSlice(fixtureVoiceProfile);
    expect(slice).not.toHaveProperty("rawDescription");
  });
});
