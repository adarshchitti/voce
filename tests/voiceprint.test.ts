import { describe, expect, it } from "vitest";
import { voiceprintFromScan } from "@/components/Voiceprint";

const NEUTRAL = { specificity: 0.5, cadence: 0.5, humanness: 0.5, grounding: 0.5 };
const CLEAN = { specificity: 1, cadence: 1, humanness: 1, grounding: 1 };

function payload(flags: Array<{ ruleId: string; details?: string }>) {
  return JSON.stringify({ flags });
}

describe("voiceprintFromScan", () => {
  // The serialisers emit null for a draft that raised zero flags, so null is
  // the happy path, not an unknown. Treating it as neutral would render the
  // cleanest drafts as a half-open flower.
  it("treats null / undefined as clean", () => {
    expect(voiceprintFromScan(null)).toEqual(CLEAN);
    expect(voiceprintFromScan(undefined)).toEqual(CLEAN);
  });

  it("returns neutral for malformed input without throwing", () => {
    const bad = ["{not json", 42, [], {}, { words: ["delve"] }, { flags: "x" }, { flags: [1, null] }];
    for (const input of bad) {
      expect(voiceprintFromScan(input)).toEqual(NEUTRAL);
    }
  });

  it("scores low on an axis whose rule fired", () => {
    const s = voiceprintFromScan(payload([{ ruleId: "struct_specificity" }]));
    expect(s.specificity).toBeLessThan(0.3);
    expect(s.cadence).toBe(1);
    expect(s.humanness).toBe(1);
    expect(s.grounding).toBe(1);
  });

  it("scores high on every axis when no rule fired (absence = passed)", () => {
    const all = { specificity: 1, cadence: 1, humanness: 1, grounding: 1 };
    expect(voiceprintFromScan(payload([]))).toEqual(all);
    // Unrelated flags do not touch the four axes.
    expect(voiceprintFromScan(payload([{ ruleId: "struct_em_dash" }]))).toEqual(all);
  });

  it("maps sentence CV detail onto cadence and accepts parsed objects", () => {
    const low = voiceprintFromScan({
      flags: [{ ruleId: "struct_sentence_cv", details: "Sentence-length CV 0.05 (target 0.4+)" }],
    });
    const near = voiceprintFromScan({
      flags: [{ ruleId: "struct_sentence_cv", details: "Sentence-length CV 0.35 (target 0.4+)" }],
    });
    expect(low.cadence).toBeLessThan(near.cadence);
    expect(near.cadence).toBeLessThan(1);
  });

  it("lowers humanness for contraction + ai-tell phrases and grounding for unsupported claims", () => {
    const s = voiceprintFromScan(
      payload([
        { ruleId: "struct_contraction_rate" },
        { ruleId: "phrase_ai_tells", details: "truth bomb; real talk" },
        {
          ruleId: "fact_check_unsupported_claims",
          details: "Claim: 'a'. Source says: b. | Claim: 'c'. Source says: d.",
        },
      ]),
    );
    expect(s.humanness).toBeLessThan(0.2);
    expect(s.grounding).toBeLessThan(0.5);
    expect(s.specificity).toBe(1);
  });
});
