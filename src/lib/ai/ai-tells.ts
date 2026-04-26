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

export const AI_TELL_SCAN_PROMPT = (draftText: string) => `
Scan this LinkedIn post for AI-generated content tells. Be strict.

POST TO SCAN:
${draftText}

Check for these specific issues:

BANNED WORDS: delve, underscore, tapestry, nuanced, leverage (verb), ecosystem,
paradigm, foster, crucial, navigate (metaphor), unleash, supercharge, revolutionize,
pivotal, groundbreaking, game-changing, transformative, holistic, robust, synergy,
spearhead, cutting-edge, seamlessly, streamline

BANNED PHRASES: "it's important to note", "in conclusion", "hot take", "unpopular opinion",
"nobody talks about this", "what do you think", "let me know in the comments",
"this changes everything", "I've been thinking about this"

STRUCTURAL TELLS:
- Every sentence on its own line (count blank lines between sentences)
- Numbered list as main body structure
- Ends with engagement beg
- Emojis used as bullet starters
- More than 3 hashtags
- Em dash used more than once

Return JSON only, no other text:
{
  "flaggedWords": ["exact word or phrase found"],
  "structureIssues": ["description of structural tell"],
  "clean": true
}

Set "clean": true only if flaggedWords is empty AND structureIssues is empty.
If anything is flagged, set "clean": false.`;
