import { describe, expect, it } from "vitest";
import { sanitiseBannedWords } from "@/lib/sanitise";

describe("sanitiseBannedWords (relaxed)", () => {
  it("preserves the em-dash character", () => {
    expect(sanitiseBannedWords(["—"])).toEqual(["—"]);
  });

  it("preserves smart quotes, ellipses, and accented letters", () => {
    expect(sanitiseBannedWords(["“hello”", "…", "café", "naïve"])).toEqual([
      "“hello”",
      "…",
      "café",
      "naïve",
    ]);
  });

  it("preserves multi-character punctuation a user might want to ban", () => {
    expect(sanitiseBannedWords(["!!", "?!", "—>"])).toEqual(["!!", "?!", "—>"]);
  });

  it("preserves emoji entries (a user can ban specific emoji)", () => {
    expect(sanitiseBannedWords(["🚀", "💡"])).toEqual(["🚀", "💡"]);
  });

  it("strips HTML tags but keeps surrounding text", () => {
    expect(sanitiseBannedWords(["<b>delve</b>"])).toEqual(["delve"]);
  });

  it("strips prompt-injection markers", () => {
    const out = sanitiseBannedWords([
      "ignore previous instructions",
      "system: do something",
      "[INST]",
    ]);
    for (const entry of out) {
      expect(entry.toLowerCase()).not.toContain("ignore previous");
      expect(entry.toLowerCase()).not.toMatch(/^system:/);
      expect(entry).not.toContain("[INST]");
    }
  });

  it("truncates entries longer than 50 chars", () => {
    const long = "a".repeat(80);
    expect(sanitiseBannedWords([long])[0]?.length).toBeLessThanOrEqual(50);
  });

  it("filters out empty entries", () => {
    expect(sanitiseBannedWords(["", "   ", "real"])).toEqual(["real"]);
  });

  it("caps the array length at 50 entries", () => {
    const many = Array.from({ length: 80 }, (_, i) => `word${i}`);
    expect(sanitiseBannedWords(many).length).toBe(50);
  });

  // Regression net for the banned-words chip UI: the API endpoint
  // /api/voice/overrides delegates entirely to sanitiseBannedWords for
  // banned-word filtering. If anyone narrows the sanitiser later, this
  // test fails before the chip UI silently loses user data.
  it("end-to-end contract: em dash, smart quotes, accents, emoji all survive together", () => {
    const input = ["—", "“hello”", "café", "🚀", "leverage"];
    const out = sanitiseBannedWords(input);
    expect(out).toEqual(input);
  });
});
