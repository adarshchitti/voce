import type { RuleContext } from "@/lib/ai/quality-rules";
import type { ScanOptions } from "@/lib/ai/quality-scan";

// Hand-authored fixtures for the post-generation quality scan. Each fixture
// targets a specific rule (or rule cluster) and asserts the rule fires on a
// representative input. mustNotFlag asserts on rules that explicitly must
// NOT fire (e.g. struct_em_dash on a draft with zero em dashes).
//
// Per-fixture assertions are intentionally narrow — we don't assert "exactly
// these flags fire and no others", because short fixtures naturally trip
// secondary rules like struct_char_count and struct_sentence_cv. The clean
// baseline (CLEAN_DRAFT) is the only fixture that asserts "no flags".

export type ScanFixture = {
  name: string;
  description: string;
  draftText: string;
  ctx: RuleContext;
  opts?: ScanOptions;
  mustFlag: string[];
  mustNotFlag?: string[];
};

const DEFAULT_CTX: RuleContext = {
  tellFlagEmDash: false,
  tellFlagEngagementBeg: true,
  tellFlagBannedWords: true,
  tellFlagNumberedLists: "three_plus",
  tellFlagEveryLine: true,
  emojiFrequency: "none",
};

// Long, varied draft authored to pass every rule. Used as the regression
// detector against over-flagging. If a future change makes this fixture
// fail, either the rule or the fixture is wrong. No em dashes intentionally
// so the fixture passes under any tellFlagEmDash setting.
const CLEAN_BASELINE = `MIT released a paper on consensus protocols last week. The headline result is a 23% latency reduction across three workload types, but the interesting part is buried in the appendix.

I've been thinking about the appendix for two days now. The benchmark used 14 nodes, which is unusual. Most consensus papers test 3, 5, or 7. Fourteen tells me the authors actually care about the regime where these protocols struggle.

Their mechanism is straightforward once you read it carefully. They split the leader's work into two pipelines: ordering and replication. Ordering is fast, replication is slower. By decoupling them, the system can keep accepting proposals even when one pipeline stalls.

The trade-off they made surprised me. They accept slightly weaker consistency in exchange for the throughput gain. Not weaker safety, just weaker recency. A reader can briefly see stale state.

What I find compelling about this design is how honest the paper is about the regime where it works. The authors call out 14 nodes and a specific workload mix. They don't claim universal applicability. Most consensus papers I've read pretend their results generalise; this one doesn't.

If you're building distributed systems and haven't read the appendix, do that this weekend. The body of the paper is fine. The appendix is where the real engineering happens.`;

export const SCAN_FIXTURES: ScanFixture[] = [
  {
    name: "clean_baseline",
    description: "Long, varied draft authored to fire no rules — over-flagging detector",
    draftText: CLEAN_BASELINE,
    ctx: { ...DEFAULT_CTX, tellFlagEmDash: true, emojiFrequency: "frequent" },
    mustFlag: [],
    mustNotFlag: [
      "struct_em_dash",
      "struct_no_accordion",
      "struct_antithesis",
      "struct_tricolon",
      "struct_sentence_cv",
      "struct_paragraph_uniform",
      "struct_specificity",
      "struct_hashtag_count",
      "struct_emoji_count",
      "struct_markdown_leak",
      "struct_char_count",
      "struct_contraction_rate",
      "struct_no_caps",
      "struct_no_first_word_i",
      "struct_no_rhetorical_open",
      "struct_no_url_in_body",
      "struct_no_decorative_emojis",
      "struct_no_bullet_substitutes",
      "struct_numbered_list",
      "phrase_engagement_beg",
      "phrase_ai_tells",
      "lex_word_choices",
      "user_banned_words",
    ],
  },

  {
    name: "em_dash_disabled_skips_rule",
    description:
      "tellFlagEmDash=false gates the rule out entirely — even with 3 em dashes, no flag fires",
    draftText:
      "The new framework — finally usable — promises lower latency. The benchmarks confirm it. Worth a read — or at least a skim.",
    ctx: { ...DEFAULT_CTX, tellFlagEmDash: false },
    mustFlag: [],
    mustNotFlag: ["struct_em_dash"],
  },

  {
    name: "em_dash_strict_threshold",
    description: "One em dash, strict threshold (tellFlagEmDash=true) — should flag",
    draftText:
      "The new framework promises lower latency — the benchmarks confirm it. Worth a read.",
    ctx: { ...DEFAULT_CTX, tellFlagEmDash: true },
    mustFlag: ["struct_em_dash"],
  },

  {
    name: "engagement_beg_tail",
    description: "Engagement beg at the tail — should flag and auto-strip",
    draftText: `MIT shipped a new paper last week. Worth reading.

The result holds across three workload types.

What do you think?`,
    ctx: DEFAULT_CTX,
    mustFlag: ["phrase_engagement_beg"],
  },

  {
    name: "user_banned_word",
    description: "User-banned word ('leverage') appears in the text",
    draftText: "We should leverage this paradigm to ship faster.",
    ctx: { ...DEFAULT_CTX, userBannedWords: ["leverage"] },
    mustFlag: ["user_banned_words"],
  },

  {
    name: "user_banned_em_dash_char",
    description:
      "User has em dash in banned words (now possible after the relaxed sanitiser); the literal char appears",
    draftText: "The new framework — finally usable.",
    ctx: { ...DEFAULT_CTX, userBannedWords: ["—"] },
    mustFlag: ["user_banned_words"],
  },

  {
    name: "user_banned_word_inflection",
    description:
      "Inflection probe. Banned word 'leverage' but text contains 'leveraging'. Both " +
      "user_banned_words and lex_word_choices use \\bword\\b regex, so the inflected form " +
      "is NOT matched. Documents the rule's exact-token behaviour. If we ever want to match " +
      "inflections, this fixture's mustNotFlag becomes mustFlag.",
    draftText: "We're leveraging this approach to ship faster. The result is real.",
    ctx: { ...DEFAULT_CTX, userBannedWords: ["leverage"] },
    mustFlag: [],
    mustNotFlag: ["user_banned_words", "lex_word_choices"],
  },

  {
    name: "ai_vocabulary_delve",
    description: "Generic AI vocabulary ('delve') triggers lex_word_choices",
    draftText: "Let's delve into the architecture and what makes it work.",
    ctx: DEFAULT_CTX,
    mustFlag: ["lex_word_choices"],
  },

  {
    name: "ai_phrase_in_conclusion",
    description: "AI-tell phrase ('in conclusion') triggers phrase_ai_tells",
    draftText:
      "The architecture has merits and trade-offs as detailed above. In conclusion, it depends on your workload.",
    ctx: DEFAULT_CTX,
    mustFlag: ["phrase_ai_tells"],
  },

  {
    name: "broetry_accordion",
    description: "Broetry / AI-accordion: most lines are 1–5 words with blanks between",
    draftText: `It works.

Until it doesn't.

Then it fails.

Hard.

Real hard.`,
    ctx: DEFAULT_CTX,
    mustFlag: ["struct_no_accordion"],
  },

  {
    name: "markdown_leak_strip",
    description: "Markdown formatting present — auto-stripped, info flag",
    draftText:
      "**The framework is great.** Read the paper at *MIT* this week. Use `consensus()` correctly.",
    ctx: DEFAULT_CTX,
    mustFlag: ["struct_markdown_leak"],
  },

  {
    name: "hashtag_count_too_many",
    description: "5 hashtags — flagged at >3 threshold",
    draftText: "Body of post here. #ai #linkedin #tech #productivity #careers",
    ctx: DEFAULT_CTX,
    mustFlag: ["struct_hashtag_count"],
  },

  {
    name: "emoji_cold_start",
    description: "1 emoji, no emojiFrequency in profile — cold-start fallback flags it",
    draftText: "Distributed systems are hard 🚀. The new MIT paper shows why.",
    ctx: { ...DEFAULT_CTX, emojiFrequency: null },
    mustFlag: ["struct_emoji_count"],
  },

  {
    name: "numbered_list_four_items",
    description: "4-item numbered list — flagged at three_plus threshold",
    draftText: `Reasons to read the paper:

1. Real benchmarks, not synthetic.
2. Honest trade-off discussion.
3. Reproducible setup.
4. Useful appendix.`,
    ctx: DEFAULT_CTX,
    mustFlag: ["struct_numbered_list"],
  },

  {
    name: "url_in_body",
    description: "Bare URL in the post body — flagged",
    draftText:
      "Worth reading: https://example.com/paper. It changed how I think about consensus.",
    ctx: DEFAULT_CTX,
    mustFlag: ["struct_no_url_in_body"],
  },

  {
    name: "template_repeat",
    description:
      "Rule requires BOTH hook type AND list presence to match across ≥4 of the last 5 " +
      "memories. Hook type comes from classifyHookType (question/data_point/personal_story/" +
      "bold_claim). List presence is hasNumberedListLines on the new text vs the memory's " +
      "structureUsed.includes('list'). New draft is classified as 'question' (ends with '?'); " +
      "no numbered list. All 5 memories: 'question' hook + structureUsed='data_unpack' (no " +
      "list). 5/5 match → fires.",
    draftText: "Why does latency matter for consumer products?",
    ctx: DEFAULT_CTX,
    opts: {
      recentMemories: [
        { hookFirstLine: "Why does X matter?", structureUsed: "data_unpack", wordCount: 200 },
        { hookFirstLine: "Why is Y interesting?", structureUsed: "data_unpack", wordCount: 220 },
        { hookFirstLine: "Why did Z surprise me?", structureUsed: "data_unpack", wordCount: 190 },
        { hookFirstLine: "Why should we care about W?", structureUsed: "data_unpack", wordCount: 205 },
        { hookFirstLine: "Why has V changed?", structureUsed: "data_unpack", wordCount: 215 },
      ],
    },
    mustFlag: ["struct_template_repeat"],
  },

  {
    name: "cross_rule_rhetorical_and_template_repeat",
    description:
      "Validates that the scan layer aggregates multiple flag triggers on a single draft. " +
      "The opening 'Why does latency...?' fires struct_no_rhetorical_open (first sentence " +
      "ends with '?') AND struct_template_repeat (hook type 'question' matches all 5 prior " +
      "memories). Both rules must appear in the result's flags array.",
    draftText: "Why does latency matter more than throughput these days?",
    ctx: DEFAULT_CTX,
    opts: {
      recentMemories: [
        { hookFirstLine: "Why does X matter?", structureUsed: "data_unpack", wordCount: 200 },
        { hookFirstLine: "Why is Y interesting?", structureUsed: "data_unpack", wordCount: 220 },
        { hookFirstLine: "Why did Z surprise me?", structureUsed: "data_unpack", wordCount: 190 },
        { hookFirstLine: "Why should we care about W?", structureUsed: "data_unpack", wordCount: 205 },
        { hookFirstLine: "Why has V changed?", structureUsed: "data_unpack", wordCount: 215 },
      ],
    },
    mustFlag: ["struct_no_rhetorical_open", "struct_template_repeat"],
  },
];
