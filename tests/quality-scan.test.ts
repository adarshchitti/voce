import { describe, expect, it } from "vitest";
import { SCAN_IMPLEMENTATIONS, runQualityScan } from "@/lib/ai/quality-scan";
import type { RuleContext } from "@/lib/ai/quality-rules";

const ctx = (overrides: Partial<RuleContext> = {}): RuleContext => ({
  tellFlagEmDash: true,
  tellFlagEngagementBeg: true,
  tellFlagBannedWords: true,
  tellFlagNumberedLists: "three_plus",
  tellFlagEveryLine: true,
  ...overrides,
});

describe("SCAN_IMPLEMENTATIONS", () => {
  describe("struct_em_dash", () => {
    const fn = SCAN_IMPLEMENTATIONS.struct_em_dash;

    it("does not flag zero em dashes", () => {
      expect(fn("Hello world.", ctx(), {})).toEqual({ violated: false });
    });

    it("default threshold (>1): one em dash is fine", () => {
      const result = fn("Hello — world.", ctx({ tellFlagEmDash: false }), {});
      expect(result.violated).toBe(false);
    });

    it("default threshold (>1): two em dashes flag", () => {
      const result = fn("Hello — world. Another — line.", ctx({ tellFlagEmDash: false }), {});
      expect(result.violated).toBe(true);
      expect(result.details).toContain("2 em dashes");
    });

    it("strict threshold (tellFlagEmDash=true): one em dash flags", () => {
      const result = fn("Hello — world.", ctx({ tellFlagEmDash: true }), {});
      expect(result.violated).toBe(true);
      expect(result.details).toContain("1 em dash");
    });
  });

  describe("struct_emoji_count", () => {
    const fn = SCAN_IMPLEMENTATIONS.struct_emoji_count;

    it("flags any emoji when profile is 'none'", () => {
      const result = fn("Hello 🚀 world", ctx({ emojiFrequency: "none" }), {});
      expect(result.violated).toBe(true);
    });

    it("allows 1 emoji when profile is 'rare'", () => {
      expect(fn("Hello 🚀 world", ctx({ emojiFrequency: "rare" }), {}).violated).toBe(false);
      expect(fn("Hello 🚀 world 🔥", ctx({ emojiFrequency: "rare" }), {}).violated).toBe(true);
    });

    it("does not flag when profile is unspecified and many emoji present", () => {
      expect(fn("🚀🚀🚀🚀", ctx(), {}).violated).toBe(false);
    });

    it("does not flag a draft with no emoji", () => {
      expect(fn("Plain text post.", ctx({ emojiFrequency: "none" }), {}).violated).toBe(false);
    });
  });

  describe("struct_hashtag_count", () => {
    const fn = SCAN_IMPLEMENTATIONS.struct_hashtag_count;

    it("does not flag 3 hashtags", () => {
      expect(fn("Body #foo #bar #baz", ctx(), {}).violated).toBe(false);
    });

    it("flags 4+ hashtags", () => {
      const result = fn("Body #a #b #c #d", ctx(), {});
      expect(result.violated).toBe(true);
      expect(result.details).toContain("4 hashtags");
    });
  });

  describe("struct_template_repeat", () => {
    const fn = SCAN_IMPLEMENTATIONS.struct_template_repeat;
    const memories = [
      { hookFirstLine: "What I learned about distributed systems?", structureUsed: "data_unpack", wordCount: 200 },
      { hookFirstLine: "What does latency cost us?", structureUsed: "data_unpack", wordCount: 220 },
      { hookFirstLine: "What's the right consistency model?", structureUsed: "data_unpack", wordCount: 190 },
      { hookFirstLine: "What if we just used SQLite?", structureUsed: "data_unpack", wordCount: 205 },
      { hookFirstLine: "Why does CRDT design matter?", structureUsed: "data_unpack", wordCount: 215 },
    ];

    it("does not flag when fewer than 4 memories provided", () => {
      const result = fn("Why are we still using REST?", ctx(), { recentMemories: memories.slice(0, 3) });
      expect(result.violated).toBe(false);
    });

    it("flags when hook+list pattern matches 4+ of last 5", () => {
      const result = fn("What if we replaced Postgres?", ctx(), { recentMemories: memories });
      expect(result.violated).toBe(true);
      expect(result.details).toContain("matches");
    });

    it("does not flag when new hook differs in type", () => {
      const result = fn("MIT released a new consensus paper.", ctx(), { recentMemories: memories });
      expect(result.violated).toBe(false);
    });
  });

  describe("struct_no_caps", () => {
    const fn = SCAN_IMPLEMENTATIONS.struct_no_caps;

    it("does not flag short acronyms (AI, API, URL, CTA)", () => {
      expect(fn("The AI API powers our URL CTA.", ctx(), {}).violated).toBe(false);
    });

    it("flags ALL CAPS words of 4+ chars", () => {
      const result = fn("This is AMAZING news.", ctx(), {});
      expect(result.violated).toBe(true);
      expect(result.details).toContain("AMAZING");
    });
  });

  describe("struct_no_first_word_i", () => {
    const fn = SCAN_IMPLEMENTATIONS.struct_no_first_word_i;

    it("flags when post opens with 'I'", () => {
      expect(fn("I think about this often.", ctx(), {}).violated).toBe(true);
    });

    it("flags when post opens with I'm / I've", () => {
      expect(fn("I'm not convinced.", ctx(), {}).violated).toBe(true);
      expect(fn("I've seen this before.", ctx(), {}).violated).toBe(true);
    });

    it("does not flag when post opens with another word", () => {
      expect(fn("Most engineers think they're great.", ctx(), {}).violated).toBe(false);
    });
  });

  describe("struct_no_rhetorical_open", () => {
    const fn = SCAN_IMPLEMENTATIONS.struct_no_rhetorical_open;

    it("flags when first sentence ends with ?", () => {
      expect(fn("Why does this matter? Because it does.", ctx(), {}).violated).toBe(true);
    });

    it("does not flag when first sentence is a statement", () => {
      expect(fn("This matters. Here is why.", ctx(), {}).violated).toBe(false);
    });
  });

  describe("struct_no_url_in_body", () => {
    const fn = SCAN_IMPLEMENTATIONS.struct_no_url_in_body;

    it("flags when URL is in the body", () => {
      const result = fn("See more at https://example.com today.", ctx(), {});
      expect(result.violated).toBe(true);
      expect(result.details).toContain("https://example.com");
    });

    it("does not flag a post without URLs", () => {
      expect(fn("No links here.", ctx(), {}).violated).toBe(false);
    });
  });

  describe("struct_numbered_list", () => {
    const fn = SCAN_IMPLEMENTATIONS.struct_numbered_list;
    const listText = "1. one\n2. two\n3. three\n4. four";

    it("flags 4 items at default 'three_plus' setting", () => {
      expect(fn(listText, ctx(), {}).violated).toBe(true);
    });

    it("does not flag 3 items at 'three_plus'", () => {
      expect(fn("1. one\n2. two\n3. three", ctx(), {}).violated).toBe(false);
    });

    it("flags any list at 'always'", () => {
      expect(fn("1. one\n2. two", ctx({ tellFlagNumberedLists: "always" }), {}).violated).toBe(true);
    });

    it("does not flag at 'never'", () => {
      expect(fn(listText, ctx({ tellFlagNumberedLists: "never" }), {}).violated).toBe(false);
    });
  });

  describe("user_banned_words", () => {
    const fn = SCAN_IMPLEMENTATIONS.user_banned_words;

    it("flags when a banned word appears", () => {
      const result = fn("We should leverage this.", ctx({ userBannedWords: ["leverage", "delve"] }), {});
      expect(result.violated).toBe(true);
      expect(result.details).toContain("leverage");
    });

    it("substring-matches non-word characters like em dash", () => {
      const result = fn("This — is — bad.", ctx({ userBannedWords: ["—"] }), {});
      expect(result.violated).toBe(true);
    });

    it("does not flag when no banned words present", () => {
      expect(fn("Clean text.", ctx({ userBannedWords: ["leverage"] }), {}).violated).toBe(false);
    });
  });
});

describe("runQualityScan", () => {
  it("does not flag em dash, engagement beg, or banned words on a normal draft", () => {
    const text = `MIT released a paper on consensus protocols. Researchers reduced latency by 23% in benchmarks.

The result holds across three workload types. I'm not surprised. Distributed systems have been ripe for this kind of optimisation.

Worth reading if you build infra.`;
    const result = runQualityScan(text, ctx({ emojiFrequency: "none" }));
    const ids = new Set(result.flags.map((f) => f.ruleId));
    expect(ids.has("struct_em_dash")).toBe(false);
    expect(ids.has("phrase_engagement_beg")).toBe(false);
    expect(ids.has("user_banned_words")).toBe(false);
    expect(ids.has("lex_word_choices")).toBe(false);
  });

  it("strips markdown silently and flags it as auto_strip", () => {
    const text = "**Bold** text and `inline code` here.";
    const result = runQualityScan(text, ctx());
    expect(result.markdownStripped).toBe(true);
    expect(result.cleanedText).not.toContain("**");
    expect(result.cleanedText).not.toContain("`");
    const stripFlag = result.flags.find((f) => f.ruleId === "struct_markdown_leak");
    expect(stripFlag).toBeDefined();
    expect(stripFlag!.action).toBe("auto_strip");
  });

  it("flags em dash strictly when tellFlagEmDash=true", () => {
    const text = "This — is — a post with em dashes.";
    const result = runQualityScan(text, ctx({ tellFlagEmDash: true }));
    expect(result.flags.some((f) => f.ruleId === "struct_em_dash")).toBe(true);
  });

  it("flags engagement beg and sets hasEngagementBeg", () => {
    const text = "Great point. What do you think?";
    const result = runQualityScan(text, ctx());
    expect(result.hasEngagementBeg).toBe(true);
    expect(result.flags.some((f) => f.ruleId === "phrase_engagement_beg")).toBe(true);
  });

  it("does not run the lex_word_choices scan when tellFlagBannedWords=false", () => {
    const text = "We should leverage this paradigm to foster growth.";
    const result = runQualityScan(text, ctx({ tellFlagBannedWords: false }));
    expect(result.flags.some((f) => f.ruleId === "lex_word_choices")).toBe(false);
  });

  it("still runs user_banned_words even when tellFlagBannedWords=false (user override is its own gate)", () => {
    const text = "We should leverage this.";
    const result = runQualityScan(
      text,
      ctx({ tellFlagBannedWords: false, userBannedWords: ["leverage"] }),
    );
    expect(result.flags.some((f) => f.ruleId === "user_banned_words")).toBe(true);
  });

  it("returns the cleanedText so callers can save the stripped version", () => {
    const text = "Hello **world**";
    const result = runQualityScan(text, ctx());
    expect(result.cleanedText).toBe("Hello world");
  });
});
