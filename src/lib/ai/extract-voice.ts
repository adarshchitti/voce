import Anthropic from "@anthropic-ai/sdk";

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");
  return new Anthropic({ apiKey });
}

export interface ExtractedVoicePatterns {
  sentenceLength: "short" | "medium" | "long";
  hookStyle: "question" | "bold_claim" | "personal_story" | "data_point" | "contrarian";
  pov: "first_person_singular" | "first_person_plural" | "third_person";
  toneMarkers: string[];
  topicsObserved: string[];
  formattingStyle: "emoji_heavy" | "emoji_light" | "no_emoji";
}

export async function extractVoicePatterns(
  samplePosts: string[],
): Promise<ExtractedVoicePatterns> {
  const client = getClient();
  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 700,
    system:
      "You are a writing style analyst. Extract the voice patterns from these LinkedIn posts.\n" +
      "Respond ONLY with valid JSON. No preamble, no markdown fences.",
    messages: [
      {
        role: "user",
        content: `Analyse these ${samplePosts.length} LinkedIn posts and extract the author's voice patterns.

Posts:
${samplePosts.map((p, i) => `--- Post ${i + 1} ---\n${p}`).join("\n\n")}

Return JSON with exactly this shape, no other text:
{
  "sentenceLength": "short | medium | long",
  "hookStyle": "question | bold_claim | personal_story | data_point | contrarian",
  "pov": "first_person_singular | first_person_plural | third_person",
  "toneMarkers": ["list", "of", "tone", "descriptors"],
  "topicsObserved": ["topic1", "topic2"],
  "formattingStyle": "emoji_heavy | emoji_light | no_emoji"
}

Definitions:
- sentenceLength short = avg under 15 words, medium = 15-25, long = over 25
- hookStyle = the dominant opening pattern across the sample posts
- toneMarkers = 3-6 adjectives describing the writing voice e.g. direct, contrarian, data-driven, warm
- topicsObserved = subject areas that appear across the posts`,
      },
    ],
  });

  const text =
    response.content[0]?.type === "text" ? response.content[0].text : "{}";

  try {
    const clean = text.replace(/```json\n?|```\n?/g, "").trim();
    return JSON.parse(clean) as ExtractedVoicePatterns;
  } catch {
    throw new Error(`Voice extraction returned invalid JSON: ${text.slice(0, 200)}`);
  }
}
