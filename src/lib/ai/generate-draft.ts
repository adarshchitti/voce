import Anthropic from "@anthropic-ai/sdk";
import { AI_TELL_BLOCKLIST_PROMPT } from "@/lib/ai/ai-tells";

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

Return JSON with exactly this shape:
{
  "hook": "The opening line only",
  "draftText": "The complete post text including hook, body, and CTA",
  "format": "text_post",
  "hashtags": ["tag1", "tag2"]
}

The draftText must include the hook as its first line.
Total draftText length must be under 3000 characters.`,
      },
    ],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
  return JSON.parse(text) as {
    hook: string;
    draftText: string;
    format: string;
    hashtags: string[];
  };
}
