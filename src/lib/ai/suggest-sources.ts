import Anthropic from "@anthropic-ai/sdk";

export type SuggestedSource = {
  url: string;
  name: string;
  why: string;
};

const MODEL = "claude-haiku-4-5-20251001";

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");
  return new Anthropic({ apiKey });
}

function buildPrompt(input: { topicLabel: string; tavilyQuery: string }): string {
  return `You are recommending RSS feed URLs and blog homepages for a LinkedIn content tool.

The user follows this topic:
- Label: ${input.topicLabel}
- Search query: ${input.tavilyQuery}

Return up to 5 high-quality, well-known sources whose RSS feeds or blog homepages
cover this topic. Prefer canonical sources (a16z.com/feed, ycombinator.com/blog,
techcrunch.com/feed) over aggregators or social. Each entry must be:
- A real, well-known publication or blog with a stable RSS feed URL.
- Specifically relevant to the topic (not generic tech news for a niche topic).
- Returned as either the direct .xml/.rss feed URL or the blog homepage URL.

If you do not have high confidence about a source's RSS URL, OMIT it. Returning
fewer than 5 — or zero — is correct when you are not confident. Do not invent
URLs. Do not hallucinate feed paths.

Return JSON only, no preamble, no markdown fences:
{
  "candidates": [
    { "url": "https://example.com/feed", "name": "Example Blog", "why": "one short sentence" }
  ]
}`;
}

/**
 * Single-shot Haiku call returning up to 5 candidate sources for a topic.
 * Returns [] on any failure (network, parse, schema mismatch) — the caller
 * decides how to surface that to the user.
 */
export async function suggestSourcesForTopic(input: {
  topicLabel: string;
  tavilyQuery: string;
}): Promise<SuggestedSource[]> {
  const client = getClient();
  let response;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 600,
      temperature: 0.2,
      messages: [{ role: "user", content: buildPrompt(input) }],
    });
  } catch (err) {
    console.error(
      "[suggest-sources] Haiku call failed:",
      err instanceof Error ? err.message : String(err),
    );
    return [];
  }

  const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
  const clean = text.replace(/```json\n?|```\n?/g, "").trim();
  let parsed: { candidates?: unknown };
  try {
    parsed = JSON.parse(clean) as { candidates?: unknown };
  } catch (err) {
    console.error(
      "[suggest-sources] JSON.parse failed:",
      err instanceof Error ? err.message : String(err),
    );
    return [];
  }

  const raw = parsed.candidates;
  if (!Array.isArray(raw)) return [];

  const out: SuggestedSource[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const url = typeof e.url === "string" ? e.url.trim() : "";
    const name = typeof e.name === "string" ? e.name.trim() : "";
    const why = typeof e.why === "string" ? e.why.trim() : "";
    if (!url || !name) continue;
    if (!/^https?:\/\//i.test(url)) continue;
    out.push({ url, name, why });
    if (out.length >= 5) break;
  }
  return out;
}
