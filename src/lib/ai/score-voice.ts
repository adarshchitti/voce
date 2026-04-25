import Anthropic from "@anthropic-ai/sdk";

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");
  return new Anthropic({ apiKey });
}

export async function scoreVoice(input: { extractedPatterns: unknown; draftText: string }) {
  const client = getClient();
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 250,
    system:
      "You are a voice consistency checker. Score how well a LinkedIn post matches \na creator's established voice. Respond ONLY with valid JSON. No preamble.",
    messages: [
      {
        role: "user",
        content: `Voice profile:
${JSON.stringify(input.extractedPatterns)}

Draft post to score:
${input.draftText}

Score this draft on 4 dimensions (each 0.0-2.5, total 10):
1. sentence_length
2. hook_style
3. pov
4. topic_relevance

Return JSON:
{
  "sentence_length": 2.0,
  "hook_style": 1.5,
  "pov": 2.5,
  "topic_relevance": 2.0,
  "total": 8.0
}`,
      },
    ],
  });
  const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
  const parsed = JSON.parse(text) as { total: number };
  return Math.max(1, Math.min(10, Math.round(parsed.total)));
}
