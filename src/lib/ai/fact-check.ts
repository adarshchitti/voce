import Anthropic from "@anthropic-ai/sdk";
import type { ScanFlag } from "@/lib/ai/quality-scan";

// Fact-check verifier: an async Haiku call that compares the generated draft
// against its source article and flags specific claims that don't appear in
// the source. Companion to the lex_source_grounding prompt rule.
//
// Phase 1 design notes:
// - Source content is typically a 500-char snippet (Tavily summary), not the
//   full article. The verifier prompt is calibrated for precision over recall:
//   only flag claims that look fabricated, not claims that might appear later
//   in the article body. Phase 2 will revisit recall once we have data.
// - Fail-open: timeout, malformed JSON, or any other error returns null. The
//   verifier is supplementary, not gating.
// - The QualityRule entry for fact_check_unsupported_claims sits in
//   STATIC_QUALITY_RULES with scanFunction undefined; the actual scan path
//   lives here because the existing SCAN_IMPLEMENTATIONS map is synchronous.

export type FactCheckSourceItem = {
  title: string;
  url: string;
  content: string;
};

// Optional input layered on top of the source article. Carries first-person
// experience claims that have been pre-approved for this draft (e.g. the
// component the personalize route selected from the user's
// personal_context_components). The verifier treats matching first-person
// claims as supported and only flags claims that are absent from BOTH the
// source content AND the permitted context.
//
// Without this plumbing, every successful "Add personal angle" use would
// produce a false-positive fact-check flag on the personal claim that the
// personalization just injected — undermining confidence in both features.
export type PermittedClaims = string;

export type FactCheckOutcome = {
  attempted: boolean;
  succeeded: boolean;
  unsupportedClaimCount: number;
  durationMs: number;
  flag: ScanFlag | null;
};

const SKIPPED_NO_SOURCE: FactCheckOutcome = {
  attempted: false,
  succeeded: false,
  unsupportedClaimCount: 0,
  durationMs: 0,
  flag: null,
};

const FACT_CHECK_TIMEOUT_MS = 15_000;

type ClaimKind =
  | "number"
  | "date"
  | "quote"
  | "attribution"
  | "entity"
  | "causal"
  | "first_person";

type UnsupportedClaim = {
  claim: string;
  kind: ClaimKind;
  source_says: string;
};

type VerifierResponse = {
  unsupported_claims: UnsupportedClaim[];
};

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");
  return new Anthropic({ apiKey });
}

function buildVerifierPrompt(
  draftText: string,
  sourceItem: FactCheckSourceItem,
  permittedClaims: PermittedClaims | null,
): string {
  const permittedSection = permittedClaims
    ? `

The user's permitted personal context for this draft is:
"${permittedClaims}"

Treat any first-person claim that matches this context as supported. Only flag first-person claims that are not in the source AND not in the permitted context. Other claim kinds (numbers, dates, named entities, attributions) are still verified against the source only — the permitted context covers personal experience, not external facts.`
    : "";

  return `You are verifying a LinkedIn draft against its source article. Identify every specific factual claim in the draft and determine whether each is directly supported by the source.

Source article:
Title: ${sourceItem.title}
URL: ${sourceItem.url}
Content:
${sourceItem.content}${permittedSection}

Draft:
${draftText}

For each specific claim in the draft, output a JSON object. A specific claim is one of:
- A number, percentage, statistic, count, or dollar figure
- A date, year, time duration, or timeline
- A direct quote
- An attribution (X said, X built, X did)
- A named entity (specific person, company, product, paper)
- A causal claim (X caused Y)
- A first-person research or experience claim (I read, I tracked, I built, I tested)

Do not flag general framing, opinion, or vague language ("most teams," "a small fraction," "recently"). Direct quotes from the source are always supported. Output ONLY claims that are specific and not supported by the source.

IMPORTANT: The source content provided may be a partial snippet of the original article (truncated to 500 characters). Many claims in the draft may be supported by parts of the article that are not in this snippet.

Only flag claims that are:
1. Highly specific (precise numbers, named individuals, specific dates, direct quotes, first-person research/experience claims), AND
2. Where you have strong reason to believe the claim was fabricated rather than possibly appearing elsewhere in the full article.

When uncertain, do not flag. The cost of a false positive (flagging a real claim) is higher than the cost of a false negative (missing a fabrication). Bias toward not flagging.

Output format (JSON only, no markdown):
{
  "unsupported_claims": [
    {
      "claim": "exact text from the draft",
      "kind": "number|date|quote|attribution|entity|causal|first_person",
      "source_says": "what the source actually says, or 'not in source'"
    }
  ]
}

If all specific claims are supported, return { "unsupported_claims": [] }.`;
}

function parseVerifierResponse(raw: string): VerifierResponse | null {
  const stripped = raw.replace(/```json\n?|```\n?/g, "").trim();
  try {
    const parsed = JSON.parse(stripped) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "unsupported_claims" in parsed &&
      Array.isArray((parsed as VerifierResponse).unsupported_claims)
    ) {
      return parsed as VerifierResponse;
    }
    return null;
  } catch {
    return null;
  }
}

function formatClaimsDetails(claims: UnsupportedClaim[]): string {
  return claims
    .map((c) => `Claim: '${c.claim}'. Source says: ${c.source_says}.`)
    .join(" | ");
}

// Anthropic SDK supports an AbortSignal on requests; wrap it with a timeout
// so a hung request can't block the caller past FACT_CHECK_TIMEOUT_MS.
async function callHaikuVerifier(prompt: string): Promise<string> {
  const client = getClient();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FACT_CHECK_TIMEOUT_MS);
  try {
    const response = await client.messages.create(
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        temperature: 0.1,
        messages: [{ role: "user", content: prompt }],
      },
      { signal: controller.signal },
    );
    const block = response.content[0];
    if (!block || block.type !== "text") {
      throw new Error("Verifier returned non-text response");
    }
    return block.text;
  } finally {
    clearTimeout(timer);
  }
}

// Public entry point. Verifies factual claims in `draftText` against
// `sourceItem`. Returns a FactCheckOutcome describing what happened plus
// (when claims are unsupported) a ScanFlag the caller can merge into the
// existing scan result.
//
// Optional `permittedClaims` carries pre-approved first-person experience
// (typically the component the personalize route selected from the user's
// personal_context_components). When set, first-person claims matching the
// permitted text are treated as supported.
//
// Fail-open: any error path returns { attempted: true, succeeded: false,
// flag: null } so the draft generation continues unaffected.
export async function verifyFactualClaims(
  draftText: string,
  sourceItem: FactCheckSourceItem | null,
  permittedClaims: PermittedClaims | null = null,
): Promise<FactCheckOutcome> {
  if (!sourceItem || !sourceItem.content || sourceItem.content.trim().length === 0) {
    return SKIPPED_NO_SOURCE;
  }
  const startedAt = Date.now();
  try {
    const prompt = buildVerifierPrompt(draftText, sourceItem, permittedClaims);
    const raw = await callHaikuVerifier(prompt);
    const parsed = parseVerifierResponse(raw);
    const durationMs = Date.now() - startedAt;
    if (!parsed) {
      console.warn("[fact-check] malformed verifier response — skipping flag");
      return { attempted: true, succeeded: false, unsupportedClaimCount: 0, durationMs, flag: null };
    }
    const claims = parsed.unsupported_claims;
    if (claims.length === 0) {
      return { attempted: true, succeeded: true, unsupportedClaimCount: 0, durationMs, flag: null };
    }
    const flag: ScanFlag = {
      ruleId: "fact_check_unsupported_claims",
      category: "structural",
      description: "Possible unsupported claims found",
      action: "flag",
      details: formatClaimsDetails(claims),
    };
    return {
      attempted: true,
      succeeded: true,
      unsupportedClaimCount: claims.length,
      durationMs,
      flag,
    };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[fact-check] verifier failed (${message.slice(0, 200)}) — skipping flag`);
    return { attempted: true, succeeded: false, unsupportedClaimCount: 0, durationMs, flag: null };
  }
}

// Test seam: parsing logic exposed for unit tests so we can exercise
// markdown-fence stripping and shape validation without an SDK call.
export const __testing = {
  parseVerifierResponse,
  formatClaimsDetails,
  buildVerifierPrompt,
};
