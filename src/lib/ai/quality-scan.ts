import {
  getActiveQualityRules,
  type QualityRule,
  type RuleAction,
  type RuleCategory,
  type RuleContext,
} from "@/lib/ai/quality-rules";

// Post-generation scan layer. Read-only with two narrow auto-actions
// (markdown strip persists, engagement-beg triggers regeneration).
// Replaces the previous Haiku LLM scan + scattered code helpers.

export type ScanFlag = {
  ruleId: string;
  category: RuleCategory;
  description: string;
  action: RuleAction;
  details?: string;
};

export type ScanOptions = {
  recentMemories?: Array<{
    hookFirstLine: string | null;
    structureUsed: string | null;
    wordCount: number | null;
  }>;
};

export type QualityScanStructural = {
  sentenceCV: number | null;
  lowSentenceVariance: boolean;
  broetryPct: number;
  broetryDetected: boolean;
  antithesisCount: number;
  tricolonCount: number;
  paragraphUniform: boolean;
  lacksConcreteness: boolean;
  hashtagCount: number;
  charCount: number;
  charCountOutOfRange: boolean;
  lowContractionRate: boolean;
};

export type QualityScanResult = {
  cleanedText: string;
  markdownStripped: boolean;
  flags: ScanFlag[];
  hasEngagementBeg: boolean;
  engagementBegFound: string | null;
  clean: boolean;
  structural: QualityScanStructural;
};

export type ScanFn = (
  draft: string,
  ctx: RuleContext,
  opts: ScanOptions,
) => { violated: boolean; details?: string };

// ─── Helpers ─────────────────────────────────────────────────────────────

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripMarkdown(text: string): { text: string; stripped: boolean } {
  const original = text;
  let result = text.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1");
  result = result.replace(/^#{1,6}\s+/gm, "");
  result = result.replace(/`([^`]+)`/g, "$1");
  return { text: result, stripped: result !== original };
}

function computeSentenceCV(text: string): number | null {
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.split(/\s+/).length >= 2);
  if (sentences.length < 3) return null;
  const lengths = sentences.map((s) => s.split(/\s+/).length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  if (mean === 0) return null;
  const variance =
    lengths.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / lengths.length;
  return Math.sqrt(variance) / mean;
}

function detectBroetry(text: string): number {
  const lines = text.split(/\r?\n/);
  let nonBlankLines = 0;
  let broetryLines = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    nonBlankLines++;
    const wordCount = line.split(/\s+/).filter(Boolean).length;
    const nextLine = lines[i + 1];
    const nextBlank = nextLine === undefined || nextLine.trim() === "";
    if (wordCount >= 1 && wordCount <= 5 && nextBlank) broetryLines++;
  }
  return nonBlankLines > 0 ? broetryLines / nonBlankLines : 0;
}

function countAntithesis(text: string): number {
  const patterns = [
    /\bnot\b.{1,40}\bbut\b/gi,
    /it'?s not.{1,40}it'?s/gi,
    /most people.{1,40}(the best|winners|leaders)/gi,
    /stop.{1,40}start/gi,
  ];
  let count = 0;
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    count += matches?.length ?? 0;
  }
  return count;
}

function countTricolon(text: string): number {
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  let count = 0;
  for (let i = 0; i < sentences.length - 2; i++) {
    const a = sentences[i].split(/\s+/).length;
    const b = sentences[i + 1].split(/\s+/).length;
    const c = sentences[i + 2].split(/\s+/).length;
    if (a <= 8 && b <= 8 && c <= 8 && a >= 2 && b >= 2 && c >= 2) count++;
  }
  return count;
}

function checkParagraphUniformity(text: string): boolean {
  const paragraphs = text.split(/\n\n+/).map((p) => p.trim()).filter((p) => p.length > 0);
  if (paragraphs.length < 2) return false;
  const wordCounts = paragraphs.map((p) => p.split(/\s+/).filter(Boolean).length);
  const hasLong = wordCounts.some((c) => c >= 40);
  const hasShort = wordCounts.some((c) => c <= 10);
  return !hasLong && !hasShort;
}

function checkConcreteness(text: string): boolean {
  const roundNumbers = new Set([3, 5, 7, 10, 50, 100, 1000]);
  const hasMultiwordProperNoun = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/.test(text);
  const hasShortAcronymOrName = /\b[A-Z][A-Za-z]{2,}\b/.test(text);
  const hasProperNoun = hasMultiwordProperNoun || hasShortAcronymOrName;
  const numberMatches = text.match(/\b\d+(?:\.\d+)?(?:%|k|M|B)?\b/g) ?? [];
  const hasNonRoundNumber = numberMatches.some((n) => {
    const parsed = parseFloat(n.replace(/[kMB%]/gi, ""));
    return !isNaN(parsed) && !roundNumbers.has(parsed);
  });
  return !hasProperNoun && !hasNonRoundNumber;
}

function checkContractionRate(text: string): boolean {
  const firstPersonSentences = text.split(/[.!?]+/).filter((s) => /\bI\b/i.test(s));
  if (firstPersonSentences.length < 2) return false;
  const contractionRe =
    /\b(I'm|I've|I'd|I'll|don't|can't|it's|isn't|wasn't|wouldn't|couldn't|didn't)\b/i;
  const withContractions = firstPersonSentences.filter((s) => contractionRe.test(s));
  return withContractions.length / firstPersonSentences.length < 0.3;
}

function classifyHookType(firstLine: string): string {
  const trimmed = firstLine.trim();
  if (!trimmed) return "unknown";
  if (trimmed.endsWith("?")) return "question";
  if (/\d/.test(trimmed)) return "data_point";
  if (/^I[' ]/.test(trimmed)) return "personal_story";
  return "bold_claim";
}

function hasNumberedListLines(text: string): boolean {
  return /^\s*\d+\.\s/m.test(text);
}

function countNumberedListItems(text: string): number {
  return (text.match(/^\s*\d+\.\s/gm) ?? []).length;
}

function countEmojis(text: string): number {
  // Match emoji using Unicode property escape — covers nearly all modern emoji
  // including pictographs, dingbats, and supplementary symbols.
  const matches = text.match(/\p{Extended_Pictographic}/gu) ?? [];
  return matches.length;
}

// ─── Static word and phrase lists ────────────────────────────────────────

const LEXICAL_FLAG_WORDS = [
  "delve",
  "leverage",
  "utilize",
  "utilise",
  "underscore",
  "navigate",
  "foster",
  "unleash",
  "supercharge",
  "revolutionize",
  "revolutionise",
  "unlock",
  "elevate",
  "embark",
  "streamline",
  "empower",
  "harness",
  "spearhead",
  "pioneer",
  "catalyze",
  "catalyse",
  "pivotal",
  "paramount",
  "crucial",
  "groundbreaking",
  "transformative",
  "holistic",
  "robust",
  "seamless",
  "comprehensive",
  "nuanced",
  "multifaceted",
  "intricate",
  "cutting-edge",
  "game-changing",
  "unprecedented",
  "dynamic",
  "meticulous",
  "commendable",
  "landscape",
  "ecosystem",
  "realm",
  "paradigm",
  "synergy",
  "alignment",
  "cornerstone",
  "testament",
  "beacon",
  "tapestry",
  "confluence",
  "notably",
  "importantly",
  "crucially",
  "fundamentally",
  "essentially",
  "ultimately",
  "undoubtedly",
  "journey",
  "intersection",
  "interplay",
  "fabric",
];

const PHRASE_FLAGS = [
  "i'll be honest",
  "here's the hard truth",
  "truth bomb",
  "real talk",
  "unpopular opinion",
  "hot take",
  "the magic happens when",
  "true growth comes from",
  "at the end of the day",
  "a testament to",
  "speaks volumes",
  "now more than ever",
  "in today's rapidly evolving",
  "let's dive in",
  "buckle up",
  "here's the kicker",
  "the bottom line is",
  "this changes everything",
  "game-changer",
  "moving the needle",
  "this is what most people miss",
  "many leaders",
  "most professionals",
  "we've all been there",
  "everyone knows",
  "we all want",
  "it's important to note",
  "in conclusion",
  "to summarize",
  "to summarise",
  "moreover,",
  "furthermore,",
];

const ENGAGEMENT_BEG_PATTERNS: RegExp[] = [
  /what do you think\??/i,
  /drop a comment/i,
  /let me know (in the comments|below|your thoughts)/i,
  /comment (yes|below|your)/i,
  /agree\??$/im,
  /thoughts\??$/im,
  /tag someone/i,
  /repost if/i,
  /share if you/i,
];

const DECORATIVE_BULLET_EMOJIS = ["🚀", "💡", "🔥", "✅", "💪", "🎯"];

// Detects an engagement-beg phrase and strips the surrounding paragraph
// (separated by blank lines) from the text. Preserves the hashtag tail —
// hashtags live in their own paragraph so they survive the strip cleanly.
// If the beg sits in a middle paragraph (rare), that whole paragraph is
// removed; engagement begs are stylistic markers, not real arguments, so
// over-stripping a paragraph is acceptable.
export function stripEngagementBegParagraph(text: string): {
  text: string;
  stripped: boolean;
  phrase: string | null;
} {
  for (const pattern of ENGAGEMENT_BEG_PATTERNS) {
    pattern.lastIndex = 0;
    const m = pattern.exec(text);
    if (!m || m.index === undefined) continue;
    const before = text.slice(0, m.index);
    const paraStartIdx = before.lastIndexOf("\n\n");
    const start = paraStartIdx === -1 ? 0 : paraStartIdx + 2;
    const afterMatch = text.slice(m.index);
    const paraEndOffset = afterMatch.indexOf("\n\n");
    const end = paraEndOffset === -1 ? text.length : m.index + paraEndOffset;
    const stripped = (text.slice(0, start) + text.slice(end))
      .replace(/\n{3,}/g, "\n\n")
      .replace(/\s+$/, "");
    return { text: stripped, stripped: true, phrase: m[0] };
  }
  return { text, stripped: false, phrase: null };
}

// ─── Scan implementations ────────────────────────────────────────────────

export const SCAN_IMPLEMENTATIONS: Record<string, ScanFn> = {
  lex_word_choices: (text) => {
    const found = LEXICAL_FLAG_WORDS.filter((word) =>
      new RegExp(`\\b${escapeRegExp(word)}\\b`, "i").test(text),
    );
    if (found.length === 0) return { violated: false };
    return { violated: true, details: found.join(", ") };
  },

  user_banned_words: (text, ctx) => {
    const words = (ctx.userBannedWords ?? []).filter((w) => w.trim().length > 0);
    if (words.length === 0) return { violated: false };
    const found = words.filter((word) => {
      // Word boundary regex falls back to substring check for entries that
      // include non-word chars (e.g. "—" or "→"), which \b cannot anchor.
      if (/^[A-Za-z0-9'\s-]+$/.test(word)) {
        return new RegExp(`\\b${escapeRegExp(word)}\\b`, "i").test(text);
      }
      return text.includes(word);
    });
    if (found.length === 0) return { violated: false };
    return { violated: true, details: found.join(", ") };
  },

  phrase_ai_tells: (text) => {
    const lower = text.toLowerCase();
    const found = PHRASE_FLAGS.filter((p) => lower.includes(p));
    if (found.length === 0) return { violated: false };
    return { violated: true, details: found.join("; ") };
  },

  // Engagement-beg detection happens out-of-band in runQualityScan because
  // the matched paragraph is auto-stripped before the rest of the rules run.
  // The flag is added directly there. This stub keeps SCAN_IMPLEMENTATIONS
  // complete-by-rule-id without double-counting.
  phrase_engagement_beg: () => ({ violated: false }),

  struct_em_dash: (text, ctx) => {
    const count = (text.match(/—/g) ?? []).length;
    // Strict: 0 (any em dash flagged). Default: >1 (more than one per post).
    const limit = ctx.tellFlagEmDash === true ? 0 : 1;
    if (count <= limit) return { violated: false };
    return {
      violated: true,
      details: `${count} em dash${count === 1 ? "" : "es"} (—)`,
    };
  },

  struct_no_accordion: (text) => {
    const pct = detectBroetry(text);
    if (pct <= 0.6) return { violated: false };
    return {
      violated: true,
      details: `${Math.round(pct * 100)}% short-line fragments (AI accordion)`,
    };
  },

  struct_no_decorative_emojis: (text) => {
    const lines = text.split(/\n/);
    for (const line of lines) {
      const stripped = line.trimStart();
      for (const emoji of DECORATIVE_BULLET_EMOJIS) {
        if (stripped.startsWith(`${emoji} `) || stripped.startsWith(`${emoji}\t`)) {
          return { violated: true, details: `Line starts with ${emoji}` };
        }
      }
    }
    return { violated: false };
  },

  struct_no_bullet_substitutes: (text) => {
    const lines = text.split(/\n/);
    for (const line of lines) {
      const stripped = line.trimStart();
      if (stripped.startsWith("→ ") || stripped.startsWith("• ")) {
        return { violated: true, details: `Line starts with ${stripped.slice(0, 2).trim()}` };
      }
    }
    return { violated: false };
  },

  struct_no_caps: (text) => {
    // 4+ consecutive uppercase letters — avoids common acronyms like AI, API,
    // URL, CTA, KPI while still catching "AMAZING", "LISTEN UP", etc.
    const matches = text.match(/(?<![A-Z])[A-Z]{4,}(?![A-Z])/g) ?? [];
    if (matches.length === 0) return { violated: false };
    return { violated: true, details: `ALL CAPS: ${matches.slice(0, 3).join(", ")}` };
  },

  struct_no_first_word_i: (text) => {
    const trimmed = text.trim();
    const firstWord = trimmed.split(/\s+/)[0] ?? "";
    if (firstWord === "I" || /^I['']/.test(firstWord)) {
      return { violated: true, details: `Post opens with "${firstWord}"` };
    }
    return { violated: false };
  },

  struct_no_rhetorical_open: (text) => {
    const trimmed = text.trim();
    const firstSentenceEnd = trimmed.search(/[.!?]/);
    if (firstSentenceEnd === -1) return { violated: false };
    const terminator = trimmed[firstSentenceEnd];
    if (terminator === "?") {
      return {
        violated: true,
        details: "Opening line is a rhetorical question",
      };
    }
    return { violated: false };
  },

  struct_hashtag_count: (text) => {
    const count = (text.match(/#\w+/g) ?? []).length;
    if (count <= 3) return { violated: false };
    return { violated: true, details: `${count} hashtags (max 3)` };
  },

  struct_no_url_in_body: (text) => {
    const match = text.match(/https?:\/\/\S+/);
    if (!match) return { violated: false };
    return { violated: true, details: `URL in body: ${match[0]}` };
  },

  struct_antithesis: (text) => {
    const count = countAntithesis(text);
    if (count <= 1) return { violated: false };
    return {
      violated: true,
      details: `${count}× "not X, but Y" pattern`,
    };
  },

  struct_tricolon: (text) => {
    const count = countTricolon(text);
    if (count <= 1) return { violated: false };
    return {
      violated: true,
      details: `${count}× three-parallel-line pattern`,
    };
  },

  struct_sentence_cv: (text) => {
    const cv = computeSentenceCV(text);
    if (cv === null) return { violated: false };
    if (cv >= 0.4) return { violated: false };
    return {
      violated: true,
      details: `Sentence-length CV ${cv.toFixed(2)} (target ≥0.4)`,
    };
  },

  struct_paragraph_uniform: (text) => {
    if (!checkParagraphUniformity(text)) return { violated: false };
    return {
      violated: true,
      details: "Paragraph length is uniform (no short or long paragraphs)",
    };
  },

  struct_specificity: (text) => {
    if (!checkConcreteness(text)) return { violated: false };
    return {
      violated: true,
      details: "Missing a proper noun or non-round number",
    };
  },

  struct_emoji_count: (text, ctx) => {
    const count = countEmojis(text);
    if (count === 0) return { violated: false };
    const freq = ctx.emojiFrequency;
    // When the user's voice profile has no emoji_frequency set (cold-start
    // users, or profiles whose extraction didn't populate the field), fall
    // back to limit 0. Rationale: the product's positioning is anti-AI-slop;
    // emoji on LinkedIn is a strong AI tell for the technical/professional
    // archetype. Cold-start drafts shouldn't include emoji the user didn't
    // ask for. Users who do want emoji see a flag on first draft and are
    // prompted to calibrate. The previous behaviour (unlimited) silently let
    // emoji spam through for every uncalibrated user.
    const limit =
      freq === "none"
        ? 0
        : freq === "rare"
          ? 1
          : freq === "occasional"
            ? 2
            : freq === "frequent"
              ? Number.POSITIVE_INFINITY
              : 0;
    if (count <= limit) return { violated: false };
    return {
      violated: true,
      details: `${count} emoji${count === 1 ? "" : "s"} (profile: ${freq ?? "unspecified — fallback limit 0 (cold-start default, calibrate to adjust)"})`,
    };
  },

  struct_markdown_leak: () => {
    // Markdown stripping is performed once at the top of runQualityScan;
    // the flag is added there directly rather than via this scan function.
    return { violated: false };
  },

  struct_char_count: (text) => {
    const count = text.length;
    if (count >= 1200 && count <= 2800) return { violated: false };
    return {
      violated: true,
      details: `${count} chars (target 1200–2800)`,
    };
  },

  struct_template_repeat: (text, _ctx, opts) => {
    const memories = (opts.recentMemories ?? []).slice(0, 5);
    if (memories.length < 4) return { violated: false };
    const newType = classifyHookType(text.split(/\n/)[0] ?? "");
    const newList = hasNumberedListLines(text);
    let matches = 0;
    for (const m of memories) {
      const memType = classifyHookType(m.hookFirstLine ?? "");
      const memList = (m.structureUsed ?? "").includes("list");
      if (memType === newType && memList === newList) matches++;
    }
    if (matches < 4) return { violated: false };
    return {
      violated: true,
      details: `Hook+list pattern matches ${matches} of last ${memories.length} approved posts`,
    };
  },

  struct_contraction_rate: (text) => {
    if (!checkContractionRate(text)) return { violated: false };
    return {
      violated: true,
      details: "Low contraction rate in first-person sentences",
    };
  },

  struct_numbered_list: (text, ctx) => {
    const setting = ctx.tellFlagNumberedLists ?? "three_plus";
    if (setting === "never") return { violated: false };
    const items = countNumberedListItems(text);
    if (items === 0) return { violated: false };
    if (setting === "always") {
      return { violated: true, details: `Numbered list (${items} item${items === 1 ? "" : "s"})` };
    }
    if (items > 3) {
      return { violated: true, details: `Numbered list (${items} items)` };
    }
    return { violated: false };
  },

  // No-op scanFunctions for prompt-only rules
  struct_no_sandwich: () => ({ violated: false }),
};

// ─── Top-level scan ──────────────────────────────────────────────────────

function isRuleGated(rule: QualityRule, ctx: RuleContext): boolean {
  // Rules with a boolean userSettingsFlag are skipped if the user has set
  // that flag to false. Enum flags (tellFlagNumberedLists) are interpreted
  // inside the scan function — they decide whether to skip themselves.
  if (!rule.userSettingsFlag) return false;
  const flagValue = ctx[rule.userSettingsFlag];
  return flagValue === false;
}

export function runQualityScan(
  draftText: string,
  ctx: RuleContext,
  opts: ScanOptions = {},
): QualityScanResult {
  // Auto-action #1: strip markdown formatting (LinkedIn renders plain text).
  const { text: postMarkdownStrip, stripped: markdownStripped } = stripMarkdown(draftText);

  // Auto-action #2: detect-and-strip engagement-beg paragraph. Gated by the
  // user's tellFlagEngagementBeg setting so users who explicitly want to keep
  // these phrases (rare, but it's their voice) opt out.
  let cleanedText = postMarkdownStrip;
  let hasEngagementBeg = false;
  let engagementBegFound: string | null = null;
  if (ctx.tellFlagEngagementBeg !== false) {
    const stripResult = stripEngagementBegParagraph(cleanedText);
    if (stripResult.stripped) {
      hasEngagementBeg = true;
      engagementBegFound = stripResult.phrase;
      cleanedText = stripResult.text;
    }
  }

  const flags: ScanFlag[] = [];

  for (const rule of getActiveQualityRules(ctx)) {
    if (isRuleGated(rule, ctx)) continue;
    if (rule.id === "phrase_engagement_beg") continue; // handled out-of-band
    const impl = SCAN_IMPLEMENTATIONS[rule.id];
    if (!impl) continue;
    const finding = impl(cleanedText, ctx, opts);
    if (!finding.violated) continue;
    flags.push({
      ruleId: rule.id,
      category: rule.category,
      description: rule.description,
      action: rule.action,
      details: finding.details,
    });
  }

  if (markdownStripped) {
    flags.push({
      ruleId: "struct_markdown_leak",
      category: "structural",
      description: "Markdown formatting stripped",
      action: "auto_strip",
    });
  }

  if (hasEngagementBeg) {
    // The rule's canonical action is "regenerate" — callers may attempt one
    // for a fresh draft, but cleanedText is already beg-free either way.
    flags.push({
      ruleId: "phrase_engagement_beg",
      category: "phrase",
      description: "Engagement beg detected and removed",
      action: "regenerate",
      details: engagementBegFound ?? undefined,
    });
  }

  // Legacy structural fields kept for the existing inbox UI serializer.
  const sentenceCV = computeSentenceCV(cleanedText);
  const broetryPct = detectBroetry(cleanedText);
  const charCount = cleanedText.length;
  const structural: QualityScanStructural = {
    sentenceCV,
    lowSentenceVariance: sentenceCV !== null && sentenceCV < 0.4,
    broetryPct,
    broetryDetected: broetryPct > 0.6,
    antithesisCount: countAntithesis(cleanedText),
    tricolonCount: countTricolon(cleanedText),
    paragraphUniform: checkParagraphUniformity(cleanedText),
    lacksConcreteness: checkConcreteness(cleanedText),
    hashtagCount: (cleanedText.match(/#\w+/g) ?? []).length,
    charCount,
    charCountOutOfRange: charCount < 1200 || charCount > 2800,
    lowContractionRate: checkContractionRate(cleanedText),
  };

  return {
    cleanedText,
    markdownStripped,
    flags,
    hasEngagementBeg,
    engagementBegFound,
    clean: flags.length === 0,
    structural,
  };
}
