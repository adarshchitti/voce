import Anthropic from "@anthropic-ai/sdk";
import { AI_TELL_BLOCKLIST_PROMPT } from "@/lib/ai/ai-tells";

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
  userBannedWords?: string[] | null;
  userNotes?: string | null;
  extractedPatterns?: unknown;
  rawDescription: string;
  title: string;
  summary: string;
  url: string;
  rejections: Array<{ reasonCode: string; freeText: string | null }>;
  instruction?: string;
}) {
  const rejectionText =
    input.rejections.length > 0
      ? `\n\nRECENT REJECTIONS - do not repeat these patterns:\n${input.rejections
          .map((r) => `- ${r.reasonCode}: "${r.freeText ?? ""}"`)
          .join("\n")}`
      : "";

  const instructionSuffix = input.instruction
    ? `\n\nADDITIONAL INSTRUCTION FROM USER: ${input.instruction}`
    : "";

  const hasStructuredFields =
    input.sentenceLength || input.hookStyle || input.pov;

  const voiceSection = hasStructuredFields
    ? `- Sentence length: ${input.sentenceLength ?? "medium"}
- Hook style: ${input.hookStyle ?? "bold_claim"}
- Point of view: ${input.pov ?? "first_person_singular"}
- Tone: ${input.toneMarkers?.join(", ") ?? "professional, direct"}
- Formatting: ${input.formattingStyle ?? "emoji_light"}
- Additional notes: ${input.userNotes ?? "none"}
- Never use these words/phrases: ${input.userBannedWords?.join(", ") ?? "none"}`
    : JSON.stringify(input.extractedPatterns);

  const client = getClient();
  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1000,
    system: `You are a ghostwriter for a LinkedIn content creator. Your sole job is to write posts
that sound EXACTLY like this specific person - not like generic LinkedIn AI content.

Voice profile:
${voiceSection}

Raw voice description from the creator:
${input.rawDescription}

STRICT RULES:
- Never exceed 3000 characters total (LinkedIn's hard limit)
- Every factual claim must come directly from the provided source article
- Do not invent statistics, quotes, or company names not in the source${rejectionText}${instructionSuffix}

${AI_TELL_BLOCKLIST_PROMPT}`,
    messages: [
      {
        role: "user",
        content: `Write a LinkedIn post based on this article.

Article title: ${input.title}
Article summary: ${input.summary}
Article URL: ${input.url}

DO NOT include the source URL in the post text. The article will be
attached as a link preview automatically when published. Write the
post body only - no URLs, no "Source:" lines at the end.

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
