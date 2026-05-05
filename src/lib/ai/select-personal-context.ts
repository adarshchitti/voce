import Anthropic from "@anthropic-ai/sdk";

// Personal-context selection. Given a draft and a list of extracted personal
// components, ask Haiku to pick the single most-relevant one (or null if none
// fit naturally). Used by the personalize route to surface a targeted angle
// rather than dumping the entire raw personal_context into the prompt.
//
// Fail-open: any error path returns { selectedIndex: null, rationale: null }.
// The personalize route then degrades gracefully — it still personalizes for
// tone and surfaces a "no fit" notice in the inbox UI.

const SELECTION_TIMEOUT_MS = 10_000;

export type PersonalContextSelection = {
  selectedIndex: number | null;
  rationale: string | null;
};

const NULL_SELECTION: PersonalContextSelection = {
  selectedIndex: null,
  rationale: null,
};

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");
  return new Anthropic({ apiKey });
}

function buildSelectionPrompt(draftText: string, components: string[]): string {
  const numbered = components.map((c, i) => `${i + 1}. ${c}`).join("\n");
  return `You are selecting the single most relevant personal experience to weave into a LinkedIn draft. The user has a list of pre-extracted experiences; pick the ONE that fits the draft's topic naturally, or return null if none fit.

DRAFT:
${draftText}

USER'S EXPERIENCES (numbered):
${numbered}

Selection criteria:
- Pick an experience whose topic/domain genuinely overlaps with the draft's subject matter
- Prefer specificity: a precise, falsifiable experience beats a vague one
- Do NOT force a connection. If nothing fits, return null. A "no fit" outcome is preferred over a strained connection.
- Pick at most one experience.

Output JSON only, no markdown:
{
  "selected_entry_number": <integer 1-${components.length} or null>,
  "rationale": "<one short sentence explaining the choice or why nothing fit>"
}`;
}

type RawSelectionResponse = {
  selected_entry_number?: unknown;
  rationale?: unknown;
};

function parseSelectionResponse(
  raw: string,
  componentCount: number,
): PersonalContextSelection | null {
  const stripped = raw.replace(/```json\n?|```\n?/g, "").trim();
  try {
    const parsed = JSON.parse(stripped) as RawSelectionResponse;
    if (!parsed || typeof parsed !== "object") return null;

    const rationale =
      typeof parsed.rationale === "string" ? parsed.rationale.trim() : null;

    const rawNum = parsed.selected_entry_number;
    if (rawNum === null || rawNum === undefined) {
      return { selectedIndex: null, rationale };
    }
    if (typeof rawNum !== "number" || !Number.isInteger(rawNum)) {
      return null;
    }
    // Clamp to valid range — if Haiku returns a number outside [1, count],
    // treat it as a no-fit selection rather than crashing.
    if (rawNum < 1 || rawNum > componentCount) {
      return { selectedIndex: null, rationale };
    }
    return { selectedIndex: rawNum - 1, rationale };
  } catch {
    return null;
  }
}

async function callHaikuSelector(prompt: string): Promise<string> {
  const client = getClient();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SELECTION_TIMEOUT_MS);
  try {
    const response = await client.messages.create(
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        temperature: 0.2,
        messages: [{ role: "user", content: prompt }],
      },
      { signal: controller.signal },
    );
    const block = response.content[0];
    if (!block || block.type !== "text") {
      throw new Error("Selector returned non-text response");
    }
    return block.text;
  } finally {
    clearTimeout(timer);
  }
}

// Public entry. Returns the index (0-based) of the selected component plus a
// short rationale, or null when no component fits. Empty components list
// returns null without an SDK call.
export async function selectPersonalContextForDraft(
  draftText: string,
  components: string[],
): Promise<PersonalContextSelection> {
  if (!components || components.length === 0) return NULL_SELECTION;
  if (!draftText || !draftText.trim()) return NULL_SELECTION;
  try {
    const responseText = await callHaikuSelector(buildSelectionPrompt(draftText, components));
    const parsed = parseSelectionResponse(responseText, components.length);
    if (!parsed) {
      console.warn("[select-personal-context] malformed selector response — treating as no fit");
      return NULL_SELECTION;
    }
    return parsed;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[select-personal-context] selector failed (${message.slice(0, 200)}) — treating as no fit`,
    );
    return NULL_SELECTION;
  }
}

export const __testing = {
  parseSelectionResponse,
  buildSelectionPrompt,
};
