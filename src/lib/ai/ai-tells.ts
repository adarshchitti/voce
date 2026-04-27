// AI tell patterns specific to LinkedIn
// Injected into every generation prompt and used in post-generation scan

export const AI_TELL_BLOCKLIST_PROMPT = `
BANNED WORDS — never use any of these under any circumstances:
delve, underscore, tapestry, nuanced, leverage (as a verb), ecosystem, paradigm,
foster, crucial, navigate (metaphorically), unleash, supercharge, revolutionize,
pivotal, groundbreaking, game-changing, transformative, holistic, robust,
synergy, spearhead, cutting-edge, innovative, seamlessly, streamline,
dive deep, unpack, double-click (metaphorically), circle back

BANNED PHRASES — never use:
- "it's important to note"
- "in conclusion"
- "I've been thinking about this a lot"
- "nobody talks about this"
- "here's what I wish someone told me"
- "what do you think? drop a comment"
- "let me know in the comments"
- "hot take:"
- "unpopular opinion:"
- "this changes everything"
- "the future of X is here"
- "X is broken. Here's how to fix it."
- "I failed. Here's what I learned."
- "years ago, I..." (as an opener)

BANNED STRUCTURES:
- Do NOT put every sentence on its own line separated by blank lines (the AI accordion)
- Do NOT use the pattern: hook → numbered list → inspirational closer (the AI sandwich)
- Do NOT end with an explicit engagement request
- Do NOT use 🚀 💡 🔥 ✅ 💪 🎯 as bullet starters or decoration
- Do NOT use → or • as bullet substitutes mid-post
- Do NOT use em dashes — in more than one sentence per post
- Do NOT use ALL CAPS for emphasis
- Max 3 hashtags, placed at the very end only if they add value
`.trim();

export interface SensitivitySettings {
  tellFlagNumberedLists: "always" | "three_plus" | "never";
  tellFlagEmDash: boolean;
  tellFlagEngagementBeg: boolean;
  tellFlagBannedWords: boolean;
  tellFlagEveryLine: boolean;
}

export const DEFAULT_SENSITIVITY: SensitivitySettings = {
  tellFlagNumberedLists: "three_plus",
  tellFlagEmDash: true,
  tellFlagEngagementBeg: true,
  tellFlagBannedWords: true,
  tellFlagEveryLine: true,
};

export const AI_TELL_SCAN_PROMPT = (
  draftText: string,
  sensitivity: SensitivitySettings = DEFAULT_SENSITIVITY,
) => `
Scan this LinkedIn post for AI-generated content tells. Be strict.

POST TO SCAN:
${draftText}

Check ONLY the following (skip any category marked as disabled):

${sensitivity.tellFlagBannedWords ? `BANNED WORDS (check for these): delve, underscore, tapestry,
nuanced, leverage (verb), ecosystem, paradigm, foster, crucial, navigate (metaphor),
unleash, supercharge, revolutionize, pivotal, groundbreaking, game-changing,
transformative, holistic, robust, synergy, spearhead, cutting-edge, seamlessly` : "// BANNED WORDS: disabled by user settings"}

${sensitivity.tellFlagEngagementBeg ? `ENGAGEMENT BEGS (check for): "what do you think", "let me know
in the comments", "drop a comment", "this changes everything", "hot take",
"unpopular opinion"` : "// ENGAGEMENT BEGS: disabled by user settings"}

${sensitivity.tellFlagEveryLine ? `EVERY LINE BREAK (check for): every sentence on its own line
with blank lines between each (AI accordion pattern)` : "// EVERY LINE BREAK: disabled by user settings"}

${sensitivity.tellFlagEmDash ? "EM DASH OVERUSE (check for): em dash - used more than once in the post" : "// EM DASH: disabled by user settings"}

${sensitivity.tellFlagNumberedLists === "always" ? "NUMBERED LIST (check for): any numbered list in the post body" :
  sensitivity.tellFlagNumberedLists === "three_plus" ? "NUMBERED LIST (check for): numbered list with MORE THAN 3 items" :
  "// NUMBERED LIST: disabled by user settings"}

Return JSON only, no other text:
{
  "flaggedWords": ["exact word or phrase found"],
  "structureIssues": ["description of structural issue"],
  "clean": true
}

Set "clean": true ONLY if both arrays are empty.
If sensitivity is set to disable a category, do not flag anything in that category.`;
