import Anthropic from "@anthropic-ai/sdk";
import { getAuthenticatedUser } from "@/lib/auth";

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");
  return new Anthropic({ apiKey });
}

export async function POST(request: Request) {
  try {
    const { unauthorized } = await getAuthenticatedUser();
    if (unauthorized) return unauthorized;
    const body = (await request.json()) as { topicLabel?: string };
    if (!body.topicLabel?.trim()) return Response.json({ error: "topicLabel is required" }, { status: 400 });

    const client = getClient();
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 120,
      messages: [
        {
          role: "user",
          content: `Convert this topic label into an effective Tavily web search query for finding
recent news and articles about this subject for LinkedIn content creation.
The query should be specific enough to return relevant results but broad enough
to find multiple articles per week.
Return JSON only: { "suggested_query": "<query string>" }

Topic label: ${body.topicLabel}`,
        },
      ],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const clean = text.replace(/```json\n?|```\n?/g, "").trim();
    const parsed = JSON.parse(clean) as { suggested_query?: string };
    if (!parsed.suggested_query?.trim()) {
      return Response.json({ error: "No suggestion generated" }, { status: 400 });
    }
    return Response.json({ suggestedQuery: parsed.suggested_query.trim() });
  } catch {
    return Response.json({ error: "Failed to suggest query" }, { status: 400 });
  }
}

