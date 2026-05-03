// AI tell patterns specific to LinkedIn
// Injected into every generation prompt and used in post-generation scan

export const AI_TELL_BLOCKLIST_PROMPT = `
WORD CHOICES — always prefer the simpler word:
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
- Specific names over "ecosystem", "landscape", "paradigm", "tapestry", "realm"

STRUCTURAL RULES:
- Do NOT put every sentence on its own line separated by blank lines (AI accordion)
- Do NOT use the pattern: hook → numbered list → inspirational closer (AI sandwich)
- Do NOT end with any engagement request or question directed at the reader
- Do NOT use 🚀 💡 🔥 ✅ 💪 🎯 as bullet starters or decoration
- Do NOT use → or • as bullet substitutes mid-post
- Do NOT use em dashes — in more than one sentence per post
- Do NOT use ALL CAPS for emphasis
- Do NOT open with "I" as the first word of the post
- Do NOT open with a rhetorical question
- Max 3 hashtags, placed at the very end only if genuinely specific to the topic
- Do NOT include any URL in the post body
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
  calibration?: {
    paragraphStyle?: string | null;
    listUsage?: string | null;
    usesEmDash?: boolean | null;
  },
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

${calibration
    ? `CALIBRATED RULES - only flag these if they conflict with this user's voice:
- Numbered lists: ${calibration.listUsage === "frequent" || calibration.listUsage === "when_appropriate" ? "DO NOT flag numbered lists for this user - they use them naturally." : "Flag numbered lists of 3+ items."}
- Every sentence on its own line: ${calibration.paragraphStyle === "single_line" ? "DO NOT flag - this is their style." : "Flag if more than 5 consecutive single-sentence paragraphs."}
- Em dashes: only flag if used more than twice in the post AND user's profile doesn't show em dash usage (${calibration.usesEmDash ? "profile shows em-dash usage" : "profile does not show em-dash usage"}).`
    : "CALIBRATED RULES: unavailable (uncalibrated user). Use universal checks only."}

UNIVERSAL RULES - always flag regardless of voice:
- Engagement beg ("drop a comment", "what do you think?", "let me know below")
- "In conclusion", "To summarise", "It's important to note"
- "Hot take" or "unpopular opinion" as opener
- Existing banned words list

Return JSON only, no other text:
{
  "flaggedWords": ["exact word or phrase found"],
  "structureIssues": ["description of structural issue"],
  "clean": true
}

Set "clean": true ONLY if both arrays are empty.
If sensitivity is set to disable a category, do not flag anything in that category.`;
