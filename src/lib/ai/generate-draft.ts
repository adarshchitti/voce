import Anthropic from "@anthropic-ai/sdk";
import { AI_TELL_BLOCKLIST_PROMPT } from "@/lib/ai/ai-tells";
import type { StructureTemplate } from "@/lib/ai/structure-templates";
import { sanitiseGenerationPromptInputs } from "@/lib/ai/prompts";
import { sanitiseShortText, FIELD_LIMITS } from "@/lib/sanitise";

const MAX_POST_CHARS = 3000;

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");
  return new Anthropic({ apiKey });
}

async function callGeneration(
  client: Anthropic,
  systemPrompt: string,
  userMessage: string,
): Promise<{ hook: string; draftText: string; hashtags: string[]; characterCount: number }> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    temperature: 0.9,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });
  const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
  const clean = text.replace(/```json\n?|```\n?/g, "").trim();
  return JSON.parse(clean) as { hook: string; draftText: string; hashtags: string[]; characterCount: number };
}

function scoreCandidate(
  draft: { draftText: string },
  _voiceProfile: { sentenceLength?: string | null; pov?: string | null },
): number {
  let score = 0;
  const text = draft.draftText;

  const aiTells = ["leverage", "paradigm", "ecosystem", "tapestry", "pivotal", "groundbreaking", "transformative", "holistic"];
  for (const tell of aiTells) {
    if (text.toLowerCase().includes(tell)) score -= 1;
  }

  const contractions = (text.match(/\b(I'm|I've|I'd|don't|can't|it's|we're|you're|they're|isn't|wasn't|wouldn't)\b/gi) ?? []).length;
  score += Math.min(contractions, 3);

  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  if (sentences.length >= 3) {
    const lengths = sentences.map((s) => s.trim().split(/\s+/).length);
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / lengths.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
    if (cv > 0.5) score += 2;
    if (cv > 0.8) score += 1;
  }

  if (/what do you think|drop a comment|let me know|agree\?/i.test(text)) score -= 3;

  return score;
}

export type GenerateDraftInput = {
  sentenceLength?: string | null;
  hookStyle?: string | null;
  pov?: string | null;
  toneMarkers?: string[] | null;
  formattingStyle?: string | null;
  paragraphStyle?: string | null;
  postStructureTemplate?: string | null;
  signaturePhrases?: string[] | null;
  generationGuidance?: string | null;
  emojiFrequency?: string | null;
  emojiContexts?: string[] | null;
  emojiExamples?: string[] | null;
  emojiNeverOverride?: boolean | null;
  userBannedWords?: string[] | null;
  userNotes?: string | null;
  extractedPatterns?: unknown;
  rawDescription: string;
  title: string;
  summary: string;
  url: string;
  rejections: Array<{ reasonCode: string; freeText: string | null; rejectionType?: string | null }>;
  instruction?: string;
  projectContext?: string | null;
  structureTemplate?: StructureTemplate | null;
  relevantMemories?: Array<{
    hookFirstLine: string | null;
    structureUsed: string | null;
    wordCount: number | null;
  }> | null;
  rulesManifest?: string | null;
};

export function buildGenerationPrompts(input: GenerateDraftInput): {
  systemPrompt: string;
  userMessage: string;
} {
  const safe = sanitiseGenerationPromptInputs({
    userNotes: input.userNotes,
    rawDescription: input.rawDescription,
    instruction: input.instruction,
    userBannedWords: input.userBannedWords,
    projectContext: input.projectContext,
  });

  const voiceRejections = input.rejections
    .filter((r) => r.rejectionType == null || r.rejectionType === "voice")
    .slice(0, 10);
  const rejectionText =
    voiceRejections.length >= 3
      ? `\n\nVOICE PATTERNS TO AVOID (from rejected drafts):\n${voiceRejections
          .map((r) => `- ${r.reasonCode}: "${sanitiseShortText(r.freeText ?? "", FIELD_LIMITS.userNotes)}"`)
          .join("\n")}`
      : "";

  const instructionSuffix = safe.instruction
    ? `\n\nADDITIONAL INSTRUCTION FROM USER: ${safe.instruction}`
    : "";

  const hasStructuredFields = input.sentenceLength || input.hookStyle || input.pov;
  const hasGuidance = Boolean(input.generationGuidance?.trim());

  // sanitiseBannedWords strips the em-dash character, so detect intent on the
  // raw input before sanitisation. Used both to surface "em dashes (—)" in the
  // user-overrides block and to override the AI_TELL_BLOCKLIST line further down.
  const userBannedEmDash = (input.userBannedWords ?? []).some((w) => w.includes("—"));
  const bannedWordsForPrompt = [
    ...(safe.userBannedWords ?? []),
    ...(userBannedEmDash ? ["em dashes (—)"] : []),
  ];
  const hasUserOverrides = bannedWordsForPrompt.length > 0 || Boolean(safe.userNotes);
  const userOverridesBlock = hasUserOverrides
    ? [
        "USER PREFERENCES (HARD RULES, NO EXCEPTIONS):",
        bannedWordsForPrompt.length > 0
          ? `- Never use these words or characters: ${bannedWordsForPrompt.join(", ")}. Not once. Zero. This is a hard rule that overrides any other guidance below.`
          : null,
        safe.userNotes ? `- Additional notes from the user: ${safe.userNotes}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  const legacyVoiceSection = hasStructuredFields
    ? `- Sentence length: ${input.sentenceLength ?? "medium"}
- Hook style: ${input.hookStyle ?? "bold_claim"}
- Point of view: ${input.pov ?? "first_person_singular"}
- Tone: ${input.toneMarkers?.join(", ") ?? "professional, direct"}
- Formatting: ${input.formattingStyle ?? "emoji_light"}`
    : JSON.stringify(input.extractedPatterns);
  const voiceSection = hasGuidance
    ? `VOICE PROFILE:
${input.generationGuidance}

POST STRUCTURE TO FOLLOW:
${input.postStructureTemplate ?? "Use a clear opening, concise body, and direct close."}

VOCABULARY TO MIRROR (use these naturally, don't force them):
${input.signaturePhrases?.length ? input.signaturePhrases.join(", ") : "none"}`
    : `VOICE PROFILE (cold-start fallback):
${legacyVoiceSection}`;
  const emojiRuleBlock = `EMOJI RULE:
${
  input.emojiNeverOverride
    ? "Use zero emojis. Not one. Zero. This is a hard rule."
    : input.emojiFrequency === "none"
      ? "Use zero emojis."
      : input.emojiFrequency === "rare"
        ? `At most one emoji per post, only where it genuinely aids comprehension.
Prefer these observed emojis: ${(input.emojiExamples ?? []).join(", ") || "none"}`
        : input.emojiFrequency === "occasional"
          ? `1-2 emojis maximum. Place them in these contexts: ${(input.emojiContexts ?? []).join(", ") || "none"}.
Prefer these observed emojis: ${(input.emojiExamples ?? []).join(", ") || "none"}`
          : `Emojis are acceptable. Mirror the user's observed usage: ${(input.emojiExamples ?? []).join(", ") || "none"}`
}
Never use 🔥💡✨🚀🎯💪 unless they appear in the user's observed emoji_examples.
Never use emojis as bullet-point substitutes.`;

  const expertFrame = `You are ghostwriting a LinkedIn post for a specific person. Your job is not to
summarise the source article — it is to share a sharp, specific observation
that this person would genuinely make, in their exact voice.

Write as a thoughtful expert sharing something they noticed, not as a content
creator optimising for engagement. The post must feel like it came from a person
with strong opinions and real experience — not from someone who studied what
performs well on LinkedIn.

Do NOT write like an AI assistant. Do NOT provide balanced summaries. Do NOT hedge
with "many people believe" or general observations anyone could make.
Write with conviction, specificity, and first-person ownership.`;

  const legacyCategorical = `Legacy categorical context:
- Sentence length: ${input.sentenceLength ?? "medium"}
- Hook style: ${input.hookStyle ?? "bold_claim"}
- Point of view: ${input.pov ?? "first_person_singular"}
- Paragraph style: ${input.paragraphStyle ?? "mixed"}
- Formatting: ${input.formattingStyle ?? "emoji_light"}

Raw voice description from the creator:
${safe.rawDescription}

${safe.projectContext?.trim() ? `---\n${safe.projectContext}\n---` : ""}`;

  const structuralRequirements = `REQUIRED IN EVERY POST:
- At least one specific proper noun (a real person, company, product, tool, or place)
- At least one non-round number (not 3, 5, 7, 10, 50, 100 — something real like 23%, 11 months, $4.2M)
- At least one paragraph over 35 words — you may have others that are shorter
- Sentence length must vary substantially — mix short punchy sentences with longer ones. Do not write all sentences at 15-20 words.
- Use contractions in first-person sentences (I'm, I've, I'd, don't, can't, it's)`;

  const structureBlock = input.structureTemplate
    ? `\nPOST STRUCTURE FOR THIS DRAFT (follow this exactly):
${input.structureTemplate.instruction}\n`
    : "";

  const contrastiveBlock = `
EXAMPLE OF WHAT NOT TO WRITE (generic AI LinkedIn style — this post would fail):
---
Leadership isn't about titles. It's about impact.

In today's rapidly evolving landscape, the most successful leaders understand
that true growth comes from within. Here are 5 lessons I've learned:

1. Lead with empathy
2. Embrace vulnerability  
3. Foster psychological safety
4. Communicate with nuance
5. Drive transformative change

The future belongs to those who invest in their people.

What leadership lesson resonates most with you? Drop a comment below! 🚀
---

ANOTHER EXAMPLE OF WHAT NOT TO WRITE:
---
Hot take: most people are thinking about AI completely wrong.

It's not about the technology. It's about the mindset.

The companies winning with AI aren't the ones with the biggest budgets.

They're the ones willing to fail fast, learn faster, and iterate.

Here's what separates the winners from the rest:
→ They start with problems, not tools
→ They empower their teams
→ They embrace uncertainty

AI isn't coming for your job. But someone using AI better than you might be.

Thoughts? 👇
---

The user's post must sound NOTHING like these examples.`.trim();

  const memoriesBlock = input.relevantMemories?.length
    ? `\nRECENT APPROVED POSTS ON THIS TOPIC (use these hook styles as reference — do not copy):
${input.relevantMemories
  .filter((m) => m.hookFirstLine)
  .map(
    (m) =>
      `- "${m.hookFirstLine}" (${m.structureUsed ?? "unknown"} structure, ~${m.wordCount ?? "?"} words)`,
  )
  .join("\n")}\n`
    : "";

  // rulesManifest will be populated by the correction loop (not yet built).
  // This injection point is wired in now so Part 2 can populate it without
  // touching this file again.
  const rulesBlock = input.rulesManifest?.trim()
    ? `\nLEARNED STYLE RULES (extracted from this user's editing history — follow these):
${input.rulesManifest}\n`
    : "\nLEARNED STYLE RULES (extracted from this user's editing history): none yet.\n";

  const strictRules = `STRICT RULES:
- Never exceed 3000 characters total (LinkedIn's hard limit)
- Every factual claim must come directly from the provided source article
- Do not invent statistics, quotes, or company names not in the source${rejectionText}${instructionSuffix}`;

  let systemPrompt = [
    expertFrame,
    userOverridesBlock,
    voiceSection,
    emojiRuleBlock,
    legacyCategorical,
    structuralRequirements,
    structureBlock,
    contrastiveBlock,
    memoriesBlock,
    rulesBlock,
    strictRules,
    AI_TELL_BLOCKLIST_PROMPT,
  ]
    .filter(Boolean)
    .join("\n\n");

  // Brittle: relies on the exact text of the em-dash line in AI_TELL_BLOCKLIST_PROMPT.
  // If that line changes, the override silently no-ops. If this becomes load-bearing,
  // refactor AI_TELL_BLOCKLIST_PROMPT into a builder that accepts user overrides.
  if (userBannedEmDash) {
    systemPrompt = systemPrompt.replace(
      "Do NOT use em dashes — in more than one sentence per post",
      "Do NOT use em dashes (—) at all. Zero. The user has explicitly banned them.",
    );
  }

  const userMessage = `Write a LinkedIn post based on this article.

Article title: ${sanitiseShortText(input.title, 500)}
Article summary: ${sanitiseShortText(input.summary, FIELD_LIMITS.samplePost)}
Article URL: ${sanitiseShortText(input.url, 2000)}

SOURCE ATTRIBUTION RULE:
Do not include any URLs in the post.
If you reference the source, use plain text only - the publication name or author name.
Example: "Via MIT Technology Review" or "From a recent Andreessen Horowitz piece"
Keep attribution brief (max 5 words) and only include it if it genuinely adds
credibility. Never end the post with a bare URL.

Return JSON with exactly this shape, no other text:
{
  "hook": "The opening line only, under 20 words",
  "draftText": "The complete post text. Do NOT include hashtags in this field.",
  "hashtags": ["tag1", "tag2"],
  "characterCount": <number of characters in draftText only, not including hashtags>
}

HASHTAG RULES:
- Generate 2-3 hashtags ONLY if genuinely specific ones exist for this topic
- If no specific hashtags fit naturally, return an empty array []
- NEVER use generic tags: #AI #Tech #Innovation #LinkedIn #Growth #Success
- Good examples: #AgenticAI #LLMEngineering #SystemDesign #SoftwareEngineering
  #MachineLearning #ProductEngineering #ResearchToProduction
- Bad examples: #AI #Tech #Coding #Learning #Career
- Hashtags go at the end of the post - they are NOT part of draftText
- Return hashtag strings without the # prefix (add it when assembling)

The draftText must include the hook as its first line.
Total draftText length must be under 3000 characters.`;

  return { systemPrompt, userMessage };
}

export async function generateDraft(input: GenerateDraftInput) {
  const { systemPrompt, userMessage } = buildGenerationPrompts(input);
  const client = getClient();

  const [rawA, rawB] = await Promise.all([
    callGeneration(client, systemPrompt, userMessage),
    callGeneration(client, systemPrompt, userMessage),
  ]);

  const scoreA = scoreCandidate(rawA, { sentenceLength: input.sentenceLength, pov: input.pov });
  const scoreB = scoreCandidate(rawB, { sentenceLength: input.sentenceLength, pov: input.pov });

  const parsed = scoreA >= scoreB ? rawA : rawB;

  const hashtags = (parsed.hashtags ?? []).filter((tag) => tag.length > 0).slice(0, 3);
  const finalText =
    hashtags.length > 0 ? `${parsed.draftText}\n\n${hashtags.map((tag) => `#${tag}`).join(" ")}` : parsed.draftText;

  if (finalText.length > MAX_POST_CHARS) {
    throw new Error(`Generated post too long: ${finalText.length} chars (limit ${MAX_POST_CHARS})`);
  }

  return {
    hook: parsed.hook,
    draftText: finalText,
    format: "text_post",
    hashtags,
  };
}
