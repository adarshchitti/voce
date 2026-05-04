import { describe, expect, it } from "vitest";
import {
  BANNED_WORDS_MAX_ENTRIES,
  BANNED_WORDS_MAX_LENGTH,
  addBannedWord,
  removeBannedWord,
} from "@/lib/banned-words-helpers";

describe("addBannedWord", () => {
  it("appends a trimmed word and reports it as added", () => {
    const result = addBannedWord(["delve"], "  leverage  ");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.next).toEqual(["delve", "leverage"]);
      expect(result.added).toBe("leverage");
    }
  });

  it("preserves non-ASCII characters (em dash, smart quotes, accents, emoji)", () => {
    let list: string[] = [];
    for (const raw of ["—", "“hello”", "café", "🚀"]) {
      const r = addBannedWord(list, raw);
      expect(r.ok).toBe(true);
      if (r.ok) list = r.next;
    }
    expect(list).toEqual(["—", "“hello”", "café", "🚀"]);
  });

  it("rejects empty input", () => {
    expect(addBannedWord([], "")).toEqual({ ok: false, reason: "empty" });
    expect(addBannedWord([], "   ")).toEqual({ ok: false, reason: "empty" });
  });

  it("rejects entries longer than the 50-char cap", () => {
    const long = "a".repeat(BANNED_WORDS_MAX_LENGTH + 1);
    expect(addBannedWord([], long)).toEqual({ ok: false, reason: "too_long" });
  });

  it("rejects case-insensitive duplicates", () => {
    expect(addBannedWord(["Leverage"], "leverage")).toEqual({
      ok: false,
      reason: "duplicate",
    });
    expect(addBannedWord(["café"], "CAFÉ")).toEqual({ ok: false, reason: "duplicate" });
  });

  it("rejects additions past the 50-entry cap", () => {
    const full = Array.from({ length: BANNED_WORDS_MAX_ENTRIES }, (_, i) => `word${i}`);
    expect(addBannedWord(full, "extra")).toEqual({ ok: false, reason: "limit" });
  });

  it("does not mutate the input array", () => {
    const original = ["delve"];
    const r = addBannedWord(original, "leverage");
    expect(original).toEqual(["delve"]);
    if (r.ok) expect(r.next).not.toBe(original);
  });
});

describe("removeBannedWord", () => {
  it("removes the entry at the given index", () => {
    expect(removeBannedWord(["a", "b", "c"], 1)).toEqual(["a", "c"]);
  });

  it("returns the original array unchanged when index is out of bounds", () => {
    const list = ["a", "b"];
    expect(removeBannedWord(list, -1)).toBe(list);
    expect(removeBannedWord(list, 5)).toBe(list);
  });

  it("does not mutate the input array", () => {
    const original = ["delve", "leverage"];
    const next = removeBannedWord(original, 0);
    expect(original).toEqual(["delve", "leverage"]);
    expect(next).toEqual(["leverage"]);
  });
});
