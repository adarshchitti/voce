import Anthropic from "@anthropic-ai/sdk";

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");
  return new Anthropic({ apiKey });
}

export async function scoreResearchItem(input: {
  topicsList: string;
  title: string;
  summary: string;
  publishedAt: string;
}) {
  const client = getClient();
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    system:
      "You are a content quality scorer for a professional LinkedIn content tool.\nScore each article on two dimensions. Respond ONLY with valid JSON.\nNo preamble, no explanation, no markdown fences.",
    messages: [
      {
        role: "user",
        content: `Score this article for a LinkedIn content creator interested in: ${input.topicsList}

Article title: ${input.title}
Article summary: ${input.summary}
Published: ${input.publishedAt}

Return JSON with exactly this shape:
{
  "relevance": 0.85,
  "originality": 0.72
}

Relevance (0-1): How closely does this match the creator's topic interests?
Originality (0-1): Does this offer a non-obvious angle or underreported perspective
  not yet widely circulated? Penalise items already covered by major publications
  with generic framing. Penalise items older than 48h. Reward fresh data, 
  contrarian takes, and niche angles a thoughtful expert would find interesting.`,
      },
    ],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
  const parsed = JSON.parse(text) as { relevance: number; originality: number };
  return parsed;
}
