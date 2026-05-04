import { describe, expect, it } from "vitest";
import {
  buildAiTellFlagsJson,
  serializeAiTellFlags,
  type ScanResult,
  type SerializedAiTellFlags,
} from "@/lib/ai/scan-draft";
import type { ScanFlag } from "@/lib/ai/quality-scan";

const emptyStructural = {
  sentenceCV: null,
  lowSentenceVariance: false,
  broetryPct: 0,
  broetryDetected: false,
  antithesisCount: 0,
  tricolonCount: 0,
  paragraphUniform: false,
  lacksConcreteness: false,
  hashtagCount: 0,
  charCount: 1500,
  charCountOutOfRange: false,
  lowContractionRate: false,
};

function makeScan(flags: ScanFlag[], opts: Partial<ScanResult> = {}): ScanResult {
  return {
    draftText: "draft",
    flags,
    hasEngagementBeg: false,
    engagementBegFound: null,
    markdownStripped: false,
    clean: flags.length === 0,
    structural: emptyStructural,
    ...opts,
  };
}

function parsePayload(json: string | null): SerializedAiTellFlags {
  expect(json).not.toBeNull();
  return JSON.parse(json!) as SerializedAiTellFlags;
}

describe("serializeAiTellFlags (new shape)", () => {
  it("returns null when there are no flags", () => {
    const result = makeScan([]);
    expect(serializeAiTellFlags(result)).toBeNull();
  });

  it("emits flags array with ruleId/category/severity/action/message/details", () => {
    const result = makeScan([
      {
        ruleId: "lex_word_choices",
        category: "lexical",
        description: "Prefer simpler synonyms over generic AI vocabulary",
        action: "flag",
        details: "leverage, paradigm",
      },
    ]);
    const payload = parsePayload(serializeAiTellFlags(result));
    expect(payload.flags).toHaveLength(1);
    expect(payload.flags[0]).toMatchObject({
      ruleId: "lex_word_choices",
      category: "lexical",
      severity: "warning",
      action: "flag",
      message: "Prefer simpler synonyms over generic AI vocabulary",
      details: "leverage, paradigm",
    });
  });

  it("derives severity from action — flag→warning, auto_strip→info, regenerate→info", () => {
    const result = makeScan([
      {
        ruleId: "lex_word_choices",
        category: "lexical",
        description: "Word choices",
        action: "flag",
      },
      {
        ruleId: "struct_markdown_leak",
        category: "structural",
        description: "Markdown stripped",
        action: "auto_strip",
      },
      {
        ruleId: "phrase_engagement_beg",
        category: "phrase",
        description: "Engagement beg removed",
        action: "regenerate",
      },
    ]);
    const payload = parsePayload(serializeAiTellFlags(result));
    expect(payload.flags.find((f) => f.ruleId === "lex_word_choices")?.severity).toBe("warning");
    expect(payload.flags.find((f) => f.ruleId === "struct_markdown_leak")?.severity).toBe("info");
    expect(payload.flags.find((f) => f.ruleId === "phrase_engagement_beg")?.severity).toBe("info");
  });

  it("does NOT emit the legacy {words, phrases, structureIssues} buckets", () => {
    const result = makeScan([
      {
        ruleId: "lex_word_choices",
        category: "lexical",
        description: "Word choices",
        action: "flag",
        details: "leverage",
      },
    ]);
    const parsed = JSON.parse(serializeAiTellFlags(result)!) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty("words");
    expect(parsed).not.toHaveProperty("phrases");
    expect(parsed).not.toHaveProperty("structureIssues");
    expect(parsed).not.toHaveProperty("structural");
    expect(parsed).not.toHaveProperty("markdownStripped");
  });

  it("omits details when not provided", () => {
    const result = makeScan([
      {
        ruleId: "struct_no_caps",
        category: "structural",
        description: "Do not use ALL CAPS",
        action: "flag",
      },
    ]);
    const payload = parsePayload(serializeAiTellFlags(result));
    expect(payload.flags[0]).not.toHaveProperty("details");
  });
});

describe("buildAiTellFlagsJson (with voice flags)", () => {
  it("merges voice flags onto a clean scan", () => {
    const result = makeScan([]);
    const payload = parsePayload(buildAiTellFlagsJson(result, ["off-tone closing"]));
    expect(payload.voice).toEqual(["off-tone closing"]);
    expect(payload.flags).toEqual([]);
  });

  it("merges voice flags alongside scan flags", () => {
    const result = makeScan([
      {
        ruleId: "lex_word_choices",
        category: "lexical",
        description: "Word choices",
        action: "flag",
        details: "leverage",
      },
    ]);
    const payload = parsePayload(buildAiTellFlagsJson(result, ["low energy"]));
    expect(payload.flags.some((f) => f.ruleId === "lex_word_choices")).toBe(true);
    expect(payload.voice).toEqual(["low energy"]);
  });

  it("returns null when both flags and voice are empty", () => {
    const result = makeScan([]);
    expect(buildAiTellFlagsJson(result, [])).toBeNull();
    expect(buildAiTellFlagsJson(result, null)).toBeNull();
    expect(buildAiTellFlagsJson(result)).toBeNull();
  });
});
