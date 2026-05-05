import Anthropic from "@anthropic-ai/sdk";

// Personal-context extraction. Takes a user's freeform description of their
// professional background and breaks it into discrete experiential components
// that can be referenced individually by the personalize-route selection step.
//
// Divergence from extract-voice.ts (intentional): that module throws on bad
// JSON because sample-post extraction gates the entire calibration loop. This
// module is fail-open — extraction is supplementary to the raw text save and
// must not block the user. A failed extraction returns { components: [] };
// the raw personal_context still saves and the personalize route falls back
// to its existing behavior.

const EXTRACTION_TIMEOUT_MS = 15_000;

export type ExtractedPersonalContext = {
  components: string[];
  rationale?: string;
};

const EMPTY_RESULT: ExtractedPersonalContext = { components: [] };

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");
  return new Anthropic({ apiKey });
}

function buildExtractionPrompt(rawText: string): string {
  return `The user has written a freeform description of their professional background and experiences. Extract this into discrete, specific experiential components that could be referenced individually in future LinkedIn posts.

Each component should be:
- One specific claim or experience
- Falsifiable (someone could verify it)
- Standalone (makes sense without context from other components)
- In the user's voice (use their phrasing where possible)

Avoid vague entries like "works in tech" or "interested in AI." Prefer specific entries like "worked at Google on search ranking 2018-2021" or "shipped 3 RAG systems last year."

If the text is vague or doesn't contain extractable specifics, return an empty array rather than forcing extraction.

User's description:
${rawText}

Output JSON only, no markdown:
{
  "components": [
    "specific component 1",
    "specific component 2"
  ]
}

Aim for 3-10 components if the text supports it. Quality over quantity.`;
}

type RawExtractionResponse = {
  components?: unknown;
};

function parseExtractionResponse(raw: string): ExtractedPersonalContext | null {
  const stripped = raw.replace(/```json\n?|```\n?/g, "").trim();
  try {
    const parsed = JSON.parse(stripped) as RawExtractionResponse;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.components)) {
      return null;
    }
    const components = parsed.components
      .filter((c): c is string => typeof c === "string")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    return { components };
  } catch {
    return null;
  }
}

async function callHaikuExtractor(prompt: string): Promise<string> {
  const client = getClient();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTRACTION_TIMEOUT_MS);
  try {
    const response = await client.messages.create(
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 800,
        temperature: 0.1,
        messages: [{ role: "user", content: prompt }],
      },
      { signal: controller.signal },
    );
    const block = response.content[0];
    if (!block || block.type !== "text") {
      throw new Error("Extractor returned non-text response");
    }
    return block.text;
  } finally {
    clearTimeout(timer);
  }
}

// Public entry. Fail-open: any error path returns { components: [] }.
// Empty/whitespace input returns { components: [] } without an SDK call.
export async function extractPersonalContextComponents(
  rawText: string,
): Promise<ExtractedPersonalContext> {
  if (!rawText || !rawText.trim()) return EMPTY_RESULT;
  try {
    const responseText = await callHaikuExtractor(buildExtractionPrompt(rawText));
    const parsed = parseExtractionResponse(responseText);
    if (!parsed) {
      console.warn("[extract-personal-context] malformed extractor response — returning empty");
      return EMPTY_RESULT;
    }
    return parsed;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[extract-personal-context] extractor failed (${message.slice(0, 200)}) — returning empty`,
    );
    return EMPTY_RESULT;
  }
}

export const __testing = {
  parseExtractionResponse,
  buildExtractionPrompt,
};
