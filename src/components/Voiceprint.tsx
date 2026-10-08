// The Voiceprint: a four-petal flower where each petal's length encodes one
// quality dimension of a generated draft. Hand-rolled inline SVG, no deps.
//
// Axis -> real source (see src/lib/ai/quality-scan.ts, fact-check.ts):
//   specificity  struct_specificity             --p-blue   (top)
//   cadence      struct_sentence_cv             --p-lilac  (right)
//   humanness    struct_contraction_rate +
//                phrase_ai_tells                --p-coral  (bottom)
//   grounding    fact_check_unsupported_claims  --p-sage   (left)

export type VoiceprintSize = 40 | 72 | 240;

export type VoiceprintScores = {
  specificity: number;
  cadence: number;
  humanness: number;
  grounding: number;
};

export type VoiceprintProps = VoiceprintScores & {
  size?: VoiceprintSize;
  className?: string;
  showLegend?: boolean;
};

type AxisKey = keyof VoiceprintScores;

const AXES: ReadonlyArray<{
  key: AxisKey;
  label: string;
  color: string;
  angle: number;
}> = [
  { key: "specificity", label: "Specificity", color: "var(--p-blue)", angle: 0 },
  { key: "cadence", label: "Cadence", color: "var(--p-lilac)", angle: 90 },
  { key: "humanness", label: "Humanness", color: "var(--p-coral)", angle: 180 },
  { key: "grounding", label: "Grounding", color: "var(--p-sage)", angle: 270 },
];

const VIEWBOX = 64;
const CENTER = VIEWBOX / 2;
const R_MIN = 11.4;
const R_MAX = 25;

// Target on-screen stroke width in px per size, converted to viewBox units so
// it stays ~3px at 240 and remains visible (but not heavy) at 40.
const STROKE_PX: Record<VoiceprintSize, number> = { 40: 1.75, 72: 2.5, 240: 3 };

function clamp01(n: number): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

function petalRadius(score: number): number {
  return R_MIN + (R_MAX - R_MIN) * clamp01(score);
}

// Rounded lobe pointing up from the origin; rotated into place by the caller.
function petalPath(r: number): string {
  const w = r * 0.55;
  return `M0 0 C${-w} ${-r * 0.2} ${-w} ${-r} 0 ${-r} C${w} ${-r} ${w} ${-r * 0.2} 0 0Z`;
}

function pct(score: number): number {
  return Math.round(clamp01(score) * 100);
}

export function Voiceprint({
  specificity,
  cadence,
  humanness,
  grounding,
  size = 72,
  className,
  showLegend = false,
}: VoiceprintProps) {
  const scores: VoiceprintScores = { specificity, cadence, humanness, grounding };
  const strokeUnits = STROKE_PX[size] / (size / VIEWBOX);
  const label =
    "Voiceprint: " +
    AXES.map((a) => `${a.label.toLowerCase()} ${pct(scores[a.key])} percent`).join(", ");
  const legend = showLegend && size === 240;

  return (
    <div
      role="img"
      aria-label={label}
      className={["inline-flex flex-col gap-4", className].filter(Boolean).join(" ")}
    >
      <svg
        aria-hidden="true"
        focusable="false"
        width={size}
        height={size}
        viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
        className="shrink-0"
      >
        {AXES.map((a) => (
          <path
            key={a.key}
            d={petalPath(petalRadius(scores[a.key]))}
            transform={`translate(${CENTER} ${CENTER}) rotate(${a.angle})`}
            style={{ fill: a.color, stroke: "var(--ink)" }}
            strokeWidth={strokeUnits}
            strokeLinejoin="round"
          />
        ))}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={2}
          style={{ fill: "var(--ink)", stroke: "var(--ink)" }}
          strokeWidth={strokeUnits * 0.25}
        />
      </svg>
      {legend ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-hidden="true">
          {AXES.map((a) => (
            <li key={a.key} className="flex items-center gap-2">
              <span
                className="inline-block size-3 shrink-0 rounded-full"
                style={{
                  backgroundColor: a.color,
                  border: "2px solid var(--ink)",
                }}
              />
              <span className="eyebrow">{a.label}</span>
              <span className="ml-auto tabular-nums">{pct(scores[a.key])}%</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// ─── voiceprintFromScan ──────────────────────────────────────────────────

// Used when the payload is present but unreadable: we genuinely do not know
// which rules passed, so sit in the middle rather than flatter the draft.
const NEUTRAL: VoiceprintScores = {
  specificity: 0.5,
  cadence: 0.5,
  humanness: 0.5,
  grounding: 0.5,
};

// Used when there is no payload at all, which the serialisers emit for a draft
// that raised no flags.
const CLEAN: VoiceprintScores = {
  specificity: 1,
  cadence: 1,
  humanness: 1,
  grounding: 1,
};

type FlagLike = { ruleId: string; details?: string };

function extractFlags(input: unknown): FlagLike[] | null {
  let value: unknown = input;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const raw = (value as { flags?: unknown }).flags;
  // Legacy rows (words/phrases/structureIssues) and unknown shapes have no
  // `flags` array, so we cannot tell which rules passed. Stay neutral.
  if (!Array.isArray(raw)) return null;
  const out: FlagLike[] = [];
  for (const f of raw) {
    if (typeof f !== "object" || f === null) continue;
    const { ruleId, details } = f as { ruleId?: unknown; details?: unknown };
    if (typeof ruleId !== "string") continue;
    out.push({ ruleId, details: typeof details === "string" ? details : undefined });
  }
  // A non-empty array with no usable entries is malformed, not "all passed".
  if (raw.length > 0 && out.length === 0) return null;
  return out;
}

/**
 * Derive four 0..1 Voiceprint scores from draft_queue.ai_tell_flags (the JSON
 * persisted by serializeAiTellFlags / buildAiTellFlagsJson). Accepts the raw
 * string or an already-parsed object. Total: never throws; null, malformed,
 * or legacy-shaped input yields 0.5 across the board.
 *
 * Inversion: the persisted payload lists only rules that FIRED (violations).
 * A rule's absence means the draft passed it, so absence scores HIGH (1) and
 * presence scores low.
 */
export function voiceprintFromScan(flags: unknown): VoiceprintScores {
  try {
    // null/undefined means CLEAN, not unknown. `serializeAiTellFlags` and
    // `buildAiTellFlagsJson` both return null when a draft raised zero flags,
    // so null is the happy path and must score full petals — treating it as
    // neutral would render the best drafts as a half-open flower.
    if (flags === null || flags === undefined) return { ...CLEAN };

    const list = extractFlags(flags);
    if (list === null) return { ...NEUTRAL };
    const byRule = (id: string) => list.find((f) => f.ruleId === id);

    // specificity: struct_specificity is binary (no proper noun / non-round number).
    const specificity = byRule("struct_specificity") ? 0.15 : 1;

    // cadence: struct_sentence_cv fires when CV < 0.4; details carry the value
    // ("Sentence-length CV 0.31 (target >=0.4)"). Map CV 0..0.4 onto 0.1..0.7.
    let cadence = 1;
    const cvFlag = byRule("struct_sentence_cv");
    if (cvFlag) {
      const m = cvFlag.details?.match(/CV\s+(\d+(?:\.\d+)?)/i);
      const cv = m ? parseFloat(m[1]) : NaN;
      cadence = Number.isFinite(cv) ? 0.1 + 0.6 * clamp01(cv / 0.4) : 0.25;
    }

    // humanness: low contraction rate and AI-tell phrase density both subtract.
    // phrase_ai_tells details are "a; b; c" so count the phrases.
    let humanness = 1;
    if (byRule("struct_contraction_rate")) humanness -= 0.4;
    const tells = byRule("phrase_ai_tells");
    if (tells) {
      const n = tells.details
        ? tells.details.split(";").filter((s) => s.trim().length > 0).length
        : 1;
      humanness -= Math.min(0.55, 0.25 * Math.max(1, n));
    }
    humanness = Math.max(0.05, humanness);

    // grounding: zero unsupported claims (no flag) = full petal. Details join
    // claims with " | ", one "Claim: '...'" per claim.
    let grounding = 1;
    const fact = byRule("fact_check_unsupported_claims");
    if (fact) {
      const n = fact.details ? (fact.details.match(/Claim:/g) ?? []).length : 1;
      grounding = Math.max(0.1, 0.5 - 0.15 * (Math.max(1, n) - 1));
    }

    return {
      specificity: clamp01(specificity),
      cadence: clamp01(cadence),
      humanness: clamp01(humanness),
      grounding: clamp01(grounding),
    };
  } catch {
    return { ...NEUTRAL };
  }
}
