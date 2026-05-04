import { sanitiseBannedWords, sanitiseShortText, FIELD_LIMITS } from "@/lib/sanitise";

// Single source of truth for quality rules used by both the generation
// prompt and (in Step 2) the post-generation scan. Replaces the previously
// scattered list across AI_TELL_BLOCKLIST_PROMPT, scan-draft.ts and
// AI_TELL_SCAN_PROMPT.
//
// Each rule has prompt-side text (default + optional strict, where strict
// applies when the user has set the corresponding tell_flag_* setting), an
// action, and an optional scanFunction (added in Step 2). User-derived rules
// (user_banned_words, user_notes) are produced dynamically from RuleContext.

export type RuleCategory = "lexical" | "phrase" | "structural";
export type RuleAction = "flag" | "auto_strip" | "regenerate";
export type RuleThreshold = number | "never";

export type UserSettingsFlag =
  | "tellFlagEmDash"
  | "tellFlagEngagementBeg"
  | "tellFlagBannedWords"
  | "tellFlagNumberedLists"
  | "tellFlagEveryLine";

export interface QualityRule {
  id: string;
  category: RuleCategory;
  description: string;
  defaultThreshold: RuleThreshold;
  userSettingsFlag?: UserSettingsFlag;
  userOverridable: boolean;
  action: RuleAction;
  promptInstructionDefault: string;
  promptInstructionStrict?: string;
  scanFunction?: (draft: string) => { violated: boolean; details?: string };
}

export interface RuleContext {
  userBannedWords?: string[] | null;
  userNotes?: string | null;
  tellFlagEmDash?: boolean | null;
  tellFlagEngagementBeg?: boolean | null;
  tellFlagBannedWords?: boolean | null;
  tellFlagNumberedLists?: "always" | "three_plus" | "never" | null;
  tellFlagEveryLine?: boolean | null;
  emojiFrequency?: string | null;
}

export const USER_BANNED_WORDS_RULE_ID = "user_banned_words";
export const USER_NOTES_RULE_ID = "user_notes";

// Static rules. Scan functions are added in Step 2; the prompt builder works
// without them.
export const STATIC_QUALITY_RULES: QualityRule[] = [
  {
    id: "lex_word_choices",
    category: "lexical",
    description: "Prefer simpler synonyms over generic AI vocabulary",
    defaultThreshold: 1,
    userSettingsFlag: "tellFlagBannedWords",
    userOverridable: true,
    action: "flag",
    promptInstructionDefault: `WORD CHOICES — always prefer the simpler word:
- "use" not "leverage", "utilize", or "employ"
- "show" not "demonstrate", "illustrate", or "underscore"
- "build" not "develop", "construct", or "create" (unless create is genuinely right)
- "find" not "discover", "uncover", or "identify"
- "change" not "transform", "revolutionize", or "reimagine"
- "important" not "crucial", "pivotal", "paramount", or "critical"
- "different" not "unique", "unprecedented", or "novel"
- "help" not "empower", "enable", or "foster"
- "use" not "harness" or "leverage"
- "think about" not "navigate" (metaphorically)
- "big" not "transformative", "groundbreaking", or "game-changing"
- Specific concrete adjectives over "robust", "holistic", "seamless", "comprehensive"
- Specific names over "ecosystem", "landscape", "paradigm", "tapestry", "realm"`,
  },
  {
    id: "phrase_engagement_beg",
    category: "phrase",
    description: "No engagement begs (drop a comment, what do you think, etc.)",
    defaultThreshold: 0,
    userSettingsFlag: "tellFlagEngagementBeg",
    userOverridable: false,
    action: "regenerate",
    promptInstructionDefault: "Do NOT end with any engagement request or question directed at the reader",
  },
  {
    id: "phrase_ai_tells",
    category: "phrase",
    description: "Generic AI-tell phrases (truth bomb, the magic happens when, etc.)",
    defaultThreshold: 0,
    userOverridable: false,
    action: "flag",
    promptInstructionDefault:
      "Do NOT use phrases like 'truth bomb', 'the magic happens when', 'in conclusion', 'it's important to note', or 'most people miss'",
  },
  {
    id: "struct_no_accordion",
    category: "structural",
    description: "Do not put every sentence on its own line (AI accordion / broetry)",
    defaultThreshold: 0.6,
    userSettingsFlag: "tellFlagEveryLine",
    userOverridable: true,
    action: "flag",
    promptInstructionDefault:
      "Do NOT put every sentence on its own line separated by blank lines (AI accordion)",
  },
  {
    id: "struct_no_sandwich",
    category: "structural",
    description: "Do not use the hook→numbered-list→inspirational-closer pattern",
    defaultThreshold: "never",
    userOverridable: false,
    action: "flag",
    promptInstructionDefault:
      "Do NOT use the pattern: hook → numbered list → inspirational closer (AI sandwich)",
  },
  {
    id: "struct_no_decorative_emojis",
    category: "structural",
    description: "No decorative AI emojis as bullet starters",
    defaultThreshold: 0,
    userOverridable: false,
    action: "flag",
    promptInstructionDefault: "Do NOT use 🚀 💡 🔥 ✅ 💪 🎯 as bullet starters or decoration",
  },
  {
    id: "struct_no_bullet_substitutes",
    category: "structural",
    description: "No arrows or bullets used as mid-post bullet substitutes",
    defaultThreshold: 0,
    userOverridable: false,
    action: "flag",
    promptInstructionDefault: "Do NOT use → or • as bullet substitutes mid-post",
  },
  {
    id: "struct_em_dash",
    category: "structural",
    description: "Em-dash density (>1 per post)",
    defaultThreshold: 1,
    userSettingsFlag: "tellFlagEmDash",
    userOverridable: true,
    action: "flag",
    promptInstructionDefault: "Do NOT use em dashes — in more than one sentence per post",
    promptInstructionStrict:
      "Do NOT use em dashes (—) at all. Zero. The user has explicitly banned them.",
  },
  {
    id: "struct_no_caps",
    category: "structural",
    description: "Do not use ALL CAPS for emphasis",
    defaultThreshold: 0,
    userOverridable: false,
    action: "flag",
    promptInstructionDefault: "Do NOT use ALL CAPS for emphasis",
  },
  {
    id: "struct_no_first_word_i",
    category: "structural",
    description: "Do not open with 'I' as the first word",
    defaultThreshold: 0,
    userOverridable: false,
    action: "flag",
    promptInstructionDefault: 'Do NOT open with "I" as the first word of the post',
  },
  {
    id: "struct_no_rhetorical_open",
    category: "structural",
    description: "Do not open with a rhetorical question",
    defaultThreshold: 0,
    userOverridable: false,
    action: "flag",
    promptInstructionDefault: "Do NOT open with a rhetorical question",
  },
  {
    id: "struct_hashtag_count",
    category: "structural",
    description: "Max 3 hashtags",
    defaultThreshold: 3,
    userOverridable: false,
    action: "flag",
    promptInstructionDefault:
      "Max 3 hashtags, placed at the very end only if genuinely specific to the topic",
  },
  {
    id: "struct_no_url_in_body",
    category: "structural",
    description: "No URL in the post body",
    defaultThreshold: 0,
    userOverridable: false,
    action: "flag",
    promptInstructionDefault: "Do NOT include any URL in the post body",
  },
  {
    id: "struct_antithesis",
    category: "structural",
    description: "Antithesis density >1 (not X but Y / it's not X it's Y)",
    defaultThreshold: 1,
    userOverridable: false,
    action: "flag",
    promptInstructionDefault:
      "Do NOT use the 'not X, but Y' antithesis pattern more than once per post",
  },
  {
    id: "struct_tricolon",
    category: "structural",
    description: "Tricolon density >1 (3 parallel one-liners as climax)",
    defaultThreshold: 1,
    userOverridable: false,
    action: "flag",
    promptInstructionDefault: "Do NOT close with three parallel one-liners (tricolon)",
  },
  {
    id: "struct_sentence_cv",
    category: "structural",
    description: "Sentence-length coefficient of variation <0.4 (uniform AI rhythm)",
    defaultThreshold: 0.4,
    userOverridable: false,
    action: "flag",
    promptInstructionDefault:
      "Sentence length must vary substantially — mix short punchy sentences with longer ones",
  },
  {
    id: "struct_paragraph_uniform",
    category: "structural",
    description: "Paragraph uniformity (no ≥40-word and no ≤10-word paragraph)",
    defaultThreshold: "never",
    userOverridable: false,
    action: "flag",
    promptInstructionDefault:
      "Vary paragraph length — at least one paragraph over 35 words, mix shorter ones in",
  },
  {
    id: "struct_specificity",
    category: "structural",
    description: "Requires at least one proper noun and one non-round number",
    defaultThreshold: "never",
    userOverridable: false,
    action: "flag",
    promptInstructionDefault:
      "Include at least one specific proper noun (a real person, company, product, tool, or place) and at least one non-round number (not 3, 5, 7, 10, 50, 100)",
  },
  {
    id: "struct_emoji_count",
    category: "structural",
    description: "Emoji count vs voice profile setting",
    defaultThreshold: "never",
    userOverridable: true,
    action: "flag",
    promptInstructionDefault: "Mirror the user's emoji frequency from their voice profile",
  },
  {
    id: "struct_markdown_leak",
    category: "structural",
    description: "Markdown formatting (asterisks, hashes, backticks) — auto-stripped",
    defaultThreshold: 0,
    userOverridable: false,
    action: "auto_strip",
    promptInstructionDefault:
      "Do NOT use markdown formatting (asterisks, hashes, backticks) — LinkedIn renders plain text",
  },
  {
    id: "struct_char_count",
    category: "structural",
    description: "Target character count 1200–2800 (advisory)",
    defaultThreshold: "never",
    userOverridable: false,
    action: "flag",
    promptInstructionDefault: "Target post length is 1200–2800 characters",
  },
  {
    id: "struct_template_repeat",
    category: "structural",
    description: "Hook+list-presence repeats >3 of the user's last 5 approved posts",
    defaultThreshold: 3,
    userOverridable: false,
    action: "flag",
    promptInstructionDefault:
      "Vary post structure — do not repeat the hook style and list presence of recent posts",
  },
  {
    id: "struct_contraction_rate",
    category: "structural",
    description: "First-person sentences should use contractions ≥30%",
    defaultThreshold: 0.3,
    userOverridable: false,
    action: "flag",
    promptInstructionDefault:
      "Use contractions in first-person sentences (I'm, I've, I'd, don't, can't, it's)",
  },
  {
    id: "struct_numbered_list",
    category: "structural",
    description: "Numbered list (gated by tell_flag_numbered_lists)",
    defaultThreshold: 3,
    userSettingsFlag: "tellFlagNumberedLists",
    userOverridable: true,
    action: "flag",
    promptInstructionDefault:
      "Avoid numbered lists with more than 3 items unless they genuinely serve the post",
  },
];

// Note on user-derived rules: there is no "soft" version of a user override.
// If the user typed a word into their banned-words list, the prompt must say
// "never use this — zero exceptions"; a softer "try to avoid this" framing
// would be a misconfiguration footgun, since the user has already expressed
// the strong preference by saving it. So we omit `userSettingsFlag` and
// `promptInstructionStrict` on user-derived rules and put the strict text
// directly in `promptInstructionDefault`. Only static rules with a genuine
// soft↔strict spectrum (em-dash, accordion) carry both versions.
//
// The companion tell_flag_* settings (e.g. tellFlagBannedWords) gate *scan*
// behaviour, not prompt strictness — Step 2 reads them when iterating rules
// for scanning.
function buildUserBannedWordsRule(words: string[]): QualityRule {
  return {
    id: USER_BANNED_WORDS_RULE_ID,
    category: "lexical",
    description: `User-banned words: ${words.join(", ")}`,
    defaultThreshold: 0,
    userOverridable: true,
    action: "flag",
    promptInstructionDefault: `Never use these words or characters: ${words.join(", ")}. Not once. Zero. This is a hard rule that overrides any other guidance below.`,
  };
}

function buildUserNotesRule(notes: string): QualityRule {
  return {
    id: USER_NOTES_RULE_ID,
    category: "lexical",
    description: "Free-text user notes",
    defaultThreshold: "never",
    userOverridable: true,
    action: "flag",
    promptInstructionDefault: `Additional notes from the user: ${notes}`,
  };
}

// Returns the active rule list — static rules + user-derived rules from
// the input context. Sanitises user-supplied values.
export function getActiveQualityRules(ctx: RuleContext): QualityRule[] {
  const rules: QualityRule[] = [];

  const sanitisedBanned = ctx.userBannedWords?.length
    ? sanitiseBannedWords(ctx.userBannedWords)
    : [];
  const sanitisedNotes = ctx.userNotes?.trim()
    ? sanitiseShortText(ctx.userNotes, FIELD_LIMITS.userNotes)
    : null;

  if (sanitisedBanned.length > 0) {
    rules.push(buildUserBannedWordsRule(sanitisedBanned));
  }
  if (sanitisedNotes) {
    rules.push(buildUserNotesRule(sanitisedNotes));
  }

  for (const rule of STATIC_QUALITY_RULES) {
    rules.push(rule);
  }
  return rules;
}

// Picks the prompt instruction for a rule given the rule context.
// User-derived rules (no settings flag) always use the strict version when
// it exists. Static rules use strict when their userSettingsFlag is true.
export function pickPromptInstruction(rule: QualityRule, ctx: RuleContext): string {
  if (!rule.promptInstructionStrict) return rule.promptInstructionDefault;
  if (!rule.userSettingsFlag) return rule.promptInstructionStrict;
  const flagValue = ctx[rule.userSettingsFlag];
  if (flagValue === true) return rule.promptInstructionStrict;
  return rule.promptInstructionDefault;
}

// Returns the "WORD CHOICES + STRUCTURAL RULES" block (replaces
// AI_TELL_BLOCKLIST_PROMPT). User-derived rules are excluded — those go
// in the userOverrides block.
export function buildBlocklistPromptSection(ctx: RuleContext): string {
  const rules = getActiveQualityRules(ctx).filter(
    (r) => r.id !== USER_BANNED_WORDS_RULE_ID && r.id !== USER_NOTES_RULE_ID,
  );

  const wordChoiceRule = rules.find((r) => r.id === "lex_word_choices");
  const otherRules = rules.filter((r) => r.id !== "lex_word_choices");

  const blocks: string[] = [];
  if (wordChoiceRule) {
    blocks.push(pickPromptInstruction(wordChoiceRule, ctx));
  }
  if (otherRules.length > 0) {
    blocks.push(
      [
        "STRUCTURAL RULES:",
        ...otherRules.map((r) => `- ${pickPromptInstruction(r, ctx)}`),
      ].join("\n"),
    );
  }
  return blocks.join("\n\n");
}

// Returns the "USER PREFERENCES (HARD RULES)" block. Empty string if no
// user-derived rules are active.
export function buildUserOverridesPromptSection(ctx: RuleContext): string {
  const rules = getActiveQualityRules(ctx).filter(
    (r) => r.id === USER_BANNED_WORDS_RULE_ID || r.id === USER_NOTES_RULE_ID,
  );
  if (rules.length === 0) return "";
  return [
    "USER PREFERENCES (HARD RULES, NO EXCEPTIONS):",
    ...rules.map((r) => `- ${pickPromptInstruction(r, ctx)}`),
  ].join("\n");
}
