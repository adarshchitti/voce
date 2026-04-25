import Anthropic from "@anthropic-ai/sdk";

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");
  return new Anthropic({ apiKey });
}

export async function extractVoicePatterns(samplePosts: string[]) {
  const client = getClient();
  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 700,
    system:
      "You are a writing style analyst. Extract the voice patterns from these LinkedIn posts.\nRespond ONLY with valid JSON. No preamble, no markdown fences.",
    messages: [
      {
        role: "user",
        content: `Analyse these LinkedIn posts and extract the author's voice patterns.

Posts:
${samplePosts.join("\n---\n")}

Return JSON with exactly this shape:
{
  "avgSentenceLength": "short",
  "hookStyles": ["bold_claim", "personal_story"],
  "pov": "first_person_singular",
  "topicsWrittenAbout": ["AI", "startups", "product management"],
  "avoidPhrases": ["synergy", "leverage", "ecosystem"],
  "emojiUsage": "rare",
  "hashtagStyle": "3_max_at_end",
  "toneDescription": "direct, slightly contrarian, data-grounded"
}`,
      },
    ],
  });
  const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
  return JSON.parse(text);
}
