import Anthropic from "@anthropic-ai/sdk";
import { AI_TELL_BLOCKLIST_PROMPT } from "@/lib/ai/ai-tells";
import { sanitiseGenerationPromptInputs } from "@/lib/ai/prompts";
import { sanitiseShortText, FIELD_LIMITS } from "@/lib/sanitise";

const MAX_POST_CHARS = 3000;

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");
  return new Anthropic({ apiKey });
}

export async function generateDraft(input: {
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
}) {
  // SECURITY: All user content must be sanitised before injection.
  // Do not remove these calls — they prevent prompt injection attacks.
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

  const legacyVoiceSection = hasStructuredFields
    ? `- Sentence length: ${input.sentenceLength ?? "medium"}
- Hook style: ${input.hookStyle ?? "bold_claim"}
- Point of view: ${input.pov ?? "first_person_singular"}
- Tone: ${input.toneMarkers?.join(", ") ?? "professional, direct"}
- Formatting: ${input.formattingStyle ?? "emoji_light"}
- Additional notes: ${safe.userNotes ?? "none"}
- Never use these words/phrases: ${safe.userBannedWords?.join(", ") ?? "none"}`
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

  const client = getClient();
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    system: `You are a ghostwriter for a LinkedIn content creator. Your sole job is to write posts
that sound EXACTLY like this specific person - not like generic LinkedIn AI content.

${voiceSection}

${emojiRuleBlock}

Legacy categorical context:
- Sentence length: ${input.sentenceLength ?? "medium"}
- Hook style: ${input.hookStyle ?? "bold_claim"}
- Point of view: ${input.pov ?? "first_person_singular"}
- Paragraph style: ${input.paragraphStyle ?? "mixed"}
- Formatting: ${input.formattingStyle ?? "emoji_light"}

Raw voice description from the creator:
${safe.rawDescription}

${safe.projectContext?.trim() ? `---\n${safe.projectContext}\n---` : ""}

STRICT RULES:
- Never exceed 3000 characters total (LinkedIn's hard limit)
- Every factual claim must come directly from the provided source article
- Do not invent statistics, quotes, or company names not in the source${rejectionText}${instructionSuffix}

${AI_TELL_BLOCKLIST_PROMPT}`,
    messages: [
      {
        role: "user",
        content: `Write a LinkedIn post based on this article.

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
Total draftText length must be under 3000 characters.`,
      },
    ],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
  const clean = text.replace(/```json\n?|```\n?/g, "").trim();
  const parsed = JSON.parse(clean) as {
    hook: string;
    draftText: string;
    hashtags: string[];
    characterCount: number;
  };
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
