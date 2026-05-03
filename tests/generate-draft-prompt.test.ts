import { describe, expect, it } from "vitest";
import {
  buildGenerationPrompts,
  type GenerateDraftInput,
} from "@/lib/ai/generate-draft";

const baseInput: GenerateDraftInput = {
  rawDescription: "I write about distributed systems with a dry sense of humor.",
  title: "A new paper on consensus protocols",
  summary: "Researchers at MIT propose a new consensus protocol with 23% lower latency.",
  url: "https://example.com/paper",
  rejections: [],
};

describe("buildGenerationPrompts em-dash trigger keys off tellFlagEmDash", () => {
  it("tellFlagEmDash=true with empty userBannedWords: em dash override fires, no userOverridesBlock", () => {
    const { systemPrompt } = buildGenerationPrompts({
      ...baseInput,
      tellFlagEmDash: true,
      userBannedWords: [],
      userNotes: null,
      generationGuidance: "Use varied sentence length.",
    });

    expect(systemPrompt).not.toContain("USER PREFERENCES (HARD RULES, NO EXCEPTIONS):");
    expect(systemPrompt).toContain(
      "Do NOT use em dashes (—) at all. Zero. The user has explicitly banned them.",
    );
    expect(systemPrompt).not.toContain(
      "Do NOT use em dashes — in more than one sentence per post",
    );
  });

  it("tellFlagEmDash=false with em dash in userBannedWords: em dash override does NOT fire", () => {
    const { systemPrompt } = buildGenerationPrompts({
      ...baseInput,
      tellFlagEmDash: false,
      userBannedWords: ["—"],
      generationGuidance: "Use varied sentence length.",
    });

    expect(systemPrompt).toContain(
      "Do NOT use em dashes — in more than one sentence per post",
    );
    expect(systemPrompt).not.toContain(
      "Do NOT use em dashes (—) at all. Zero. The user has explicitly banned them.",
    );
    expect(systemPrompt).not.toContain("characters: em dashes");
  });

  it("tellFlagEmDash=true with delve in userBannedWords: both em dash override AND userOverridesBlock for delve render", () => {
    const { systemPrompt } = buildGenerationPrompts({
      ...baseInput,
      tellFlagEmDash: true,
      userBannedWords: ["delve"],
      generationGuidance: "Use varied sentence length.",
      postStructureTemplate: "Open. Develop. Close.",
    });

    expect(systemPrompt).toContain("USER PREFERENCES (HARD RULES, NO EXCEPTIONS):");
    expect(systemPrompt).toContain("Never use these words or characters: delve");
    expect(systemPrompt).toContain("This is a hard rule that overrides any other guidance below.");
    expect(systemPrompt).not.toContain("Never use these words or characters: delve, em dashes");
    expect(systemPrompt).not.toContain("characters: em dashes");

    expect(systemPrompt).toContain(
      "Do NOT use em dashes (—) at all. Zero. The user has explicitly banned them.",
    );
    expect(systemPrompt).not.toContain(
      "Do NOT use em dashes — in more than one sentence per post",
    );

    const overridesIdx = systemPrompt.indexOf("USER PREFERENCES (HARD RULES");
    const voiceIdx = systemPrompt.indexOf("VOICE PROFILE");
    expect(overridesIdx).toBeGreaterThan(-1);
    expect(voiceIdx).toBeGreaterThan(overridesIdx);
  });

  it("tellFlagEmDash undefined/null and empty userBannedWords: no override, no overrides block", () => {
    const { systemPrompt } = buildGenerationPrompts({
      ...baseInput,
      userBannedWords: [],
      userNotes: null,
      generationGuidance: "Use varied sentence length.",
    });

    expect(systemPrompt).not.toContain("USER PREFERENCES (HARD RULES, NO EXCEPTIONS):");
    expect(systemPrompt).toContain(
      "Do NOT use em dashes — in more than one sentence per post",
    );
  });

  it("renders userOverridesBlock and calibrated voice section together (banned words + generationGuidance)", () => {
    const { systemPrompt } = buildGenerationPrompts({
      ...baseInput,
      tellFlagEmDash: true,
      userBannedWords: ["synergy", "leverage"],
      userNotes: "Never end with a question.",
      generationGuidance: "Use varied sentence length. Cite a specific data point.",
      postStructureTemplate: "Open with one bold statement. Develop. Close on takeaway.",
      signaturePhrases: ["worth noting", "real talk"],
    });

    expect(systemPrompt).toContain("USER PREFERENCES (HARD RULES, NO EXCEPTIONS):");
    expect(systemPrompt).toContain("Never use these words or characters: synergy, leverage");
    expect(systemPrompt).toContain("Additional notes from the user: Never end with a question.");

    expect(systemPrompt).toContain("VOICE PROFILE:");
    expect(systemPrompt).toContain("Use varied sentence length. Cite a specific data point.");
    expect(systemPrompt).toContain("POST STRUCTURE TO FOLLOW:");
    expect(systemPrompt).toContain("Open with one bold statement. Develop. Close on takeaway.");
    expect(systemPrompt).toContain("VOCABULARY TO MIRROR");
    expect(systemPrompt).toContain("worth noting, real talk");

    const overridesIdx = systemPrompt.indexOf("USER PREFERENCES (HARD RULES");
    const voiceIdx = systemPrompt.indexOf("VOICE PROFILE:");
    expect(overridesIdx).toBeGreaterThan(-1);
    expect(voiceIdx).toBeGreaterThan(overridesIdx);
  });

  it("renders userOverridesBlock on the cold-start path (no generationGuidance) when banned words are present", () => {
    const { systemPrompt } = buildGenerationPrompts({
      ...baseInput,
      tellFlagEmDash: true,
      userBannedWords: ["delve"],
      sentenceLength: "medium",
      hookStyle: "bold_claim",
      pov: "first_person_singular",
    });

    expect(systemPrompt).toContain("USER PREFERENCES (HARD RULES, NO EXCEPTIONS):");
    expect(systemPrompt).toContain("delve");
    expect(systemPrompt).toContain("VOICE PROFILE (cold-start fallback):");

    const overridesIdx = systemPrompt.indexOf("USER PREFERENCES (HARD RULES");
    const coldStartIdx = systemPrompt.indexOf("VOICE PROFILE (cold-start fallback)");
    expect(overridesIdx).toBeGreaterThan(-1);
    expect(coldStartIdx).toBeGreaterThan(overridesIdx);
  });
});
