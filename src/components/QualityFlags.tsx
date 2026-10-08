"use client";

import { useId, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Voiceprint, voiceprintFromScan } from "@/components/Voiceprint";
import { STATIC_QUALITY_RULES } from "@/lib/ai/quality-rules";
import { cn } from "@/lib/utils";

// ─── Flag parsing (moved from DraftCard, semantics unchanged) ────────────────

export type UiFlag = {
  ruleId: string;
  category: "lexical" | "phrase" | "structural";
  severity: "info" | "warning";
  action: "flag" | "auto_strip" | "regenerate";
  message: string;
  details?: string;
};

export type ParsedAiTellFlags = {
  flags: UiFlag[];
  voice: string[];
};

// Reads the new {flags: [...]} shape produced by serializeAiTellFlags after
// the May 2026 quality-rules rebuild. Falls back to the pre-rebuild shape
// ({words, phrases, structureIssues, markdownStripped}) so drafts already
// in draft_queue when the rebuild deploys still render meaningfully — those
// rows fade out within 24–72 h via staleAfter.
export function parseAiTellFlags(raw: string | null): ParsedAiTellFlags {
  if (!raw) return { flags: [], voice: [] };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const voice = Array.isArray(parsed.voice) ? (parsed.voice as string[]) : [];
    if (Array.isArray(parsed.flags)) {
      return { flags: parsed.flags as UiFlag[], voice };
    }
    // Legacy shape — translate.
    const flags: UiFlag[] = [];
    const words = (parsed.words as string[]) ?? [];
    if (words.length > 0) {
      flags.push({
        ruleId: "legacy_word",
        category: "lexical",
        severity: "warning",
        action: "flag",
        message: "Generic AI vocabulary",
        details: words.join(", "),
      });
    }
    for (const p of (parsed.phrases as string[]) ?? []) {
      flags.push({
        ruleId: "legacy_phrase",
        category: "phrase",
        severity: "warning",
        action: "flag",
        message: "AI-tell phrase",
        details: p,
      });
    }
    for (const s of ((parsed.structureIssues ?? parsed.structure) as string[]) ?? []) {
      flags.push({
        ruleId: "legacy_structure",
        category: "structural",
        severity: "warning",
        action: "flag",
        message: s,
      });
    }
    if (parsed.markdownStripped) {
      flags.push({
        ruleId: "struct_markdown_leak",
        category: "structural",
        severity: "info",
        action: "auto_strip",
        message: "Markdown formatting stripped",
      });
    }
    return { flags, voice };
  } catch {
    return { flags: [], voice: [] };
  }
}

const FACT_CHECK_RULE_ID = "fact_check_unsupported_claims";

// Splits the fact-check flag's details into one entry per claim. The verifier
// produces a pipe-separated string ("Claim: 'X'. Source says: Y. | Claim:
// '...'. Source says: ..."); we split it back out so each claim sits on its own
// row. Highest-signal flag in the strip — the user is likely to act on it.
function splitClaims(details?: string): string[] {
  return (details ?? "")
    .split(" | ")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Separates one claim entry into the claim itself and the "source says" line.
// Presentation only; entries without a "Source says:" marker render as a bare
// claim.
function splitClaim(entry: string): { claim: string; source: string | null } {
  const m = entry.match(/^([\s\S]*?)\.?\s*Source says:\s*([\s\S]*)$/i);
  const claimRaw = (m ? m[1] : entry).replace(/^Claim:\s*/i, "").trim();
  const source = m ? m[2].trim() : "";
  return { claim: claimRaw, source: source.length > 0 ? source : null };
}

function FactCheckFlagBody({ details }: { details?: string }) {
  const claims = splitClaims(details);
  return (
    <div>
      <p className="text-[13px] font-semibold text-ink">Possible unsupported claims</p>
      <p className="mt-0.5 text-[12px] text-ink-2">
        These specific claims may not be supported by the source. Review and edit if needed.
      </p>
      {claims.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {claims.map((entry, i) => {
            const { claim, source } = splitClaim(entry);
            return (
              <li key={i} className="border-l-2 border-dashed border-ink pl-3">
                <p className="text-[13px] leading-snug text-ink">{claim}</p>
                {source ? (
                  <p className="mt-0.5 text-[12px] leading-snug text-ink-2">
                    <span className="font-medium">Source says:</span> {source}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

// ─── View model ──────────────────────────────────────────────────────────────

type Item = {
  key: string;
  kind: "flag" | "voice";
  severity: "warning" | "info";
  ruleId: string;
  /** Short human label for the chip. */
  label: string;
  message: string;
  details?: string;
};

const RULE_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
  STATIC_QUALITY_RULES.map((r) => [r.id, r.description]),
);

// lex_source_grounding has no scan of its own; fact_check_unsupported_claims
// is its companion, so it is not counted twice.
const RULES_CHECKED = STATIC_QUALITY_RULES.filter((r) => r.id !== "lex_source_grounding").length;

const AXES = [
  { key: "specificity", label: "Specificity", color: "var(--p-blue)" },
  { key: "cadence", label: "Cadence", color: "var(--p-lilac)" },
  { key: "humanness", label: "Humanness", color: "var(--p-coral)" },
  { key: "grounding", label: "Grounding", color: "var(--p-sage)" },
] as const;

function buildItems(parsed: ParsedAiTellFlags): Item[] {
  const warnings: Item[] = [];
  const infos: Item[] = [];
  parsed.flags.forEach((f, i) => {
    const item: Item = {
      key: `${f.ruleId}-${i}`,
      kind: "flag",
      severity: f.severity,
      ruleId: f.ruleId,
      // Warnings show the rule's human description; info/auto-cleaned flags
      // show their own message ("Markdown formatting stripped"), which reads
      // better than the rule description for something already fixed.
      label: f.severity === "warning" ? (RULE_DESCRIPTIONS[f.ruleId] ?? f.message) : f.message,
      message: f.message,
      details: f.details,
    };
    (f.severity === "warning" ? warnings : infos).push(item);
  });
  // Fact-check is the highest-signal flag: always first.
  warnings.sort(
    (a, b) => Number(b.ruleId === FACT_CHECK_RULE_ID) - Number(a.ruleId === FACT_CHECK_RULE_ID),
  );
  const voice: Item[] = parsed.voice.map((v, i) => ({
    key: `voice-${i}`,
    kind: "voice",
    severity: "warning",
    ruleId: "voice",
    label: `Voice: ${v}`,
    message: "Voice flag",
    details: v,
  }));
  return [...warnings, ...voice, ...infos];
}

// ─── Component ───────────────────────────────────────────────────────────────

export type QualityFlagsProps = {
  /** Raw draft.aiTellFlags JSON (or null for a clean draft). */
  aiTellFlags: string | null;
  /** Show the "Re-scanned with current rules" note (regenerated draft that still has flags). */
  showRescanNote?: boolean;
  className?: string;
};

export function QualityFlags({ aiTellFlags, showRescanNote = false, className }: QualityFlagsProps) {
  const reduceMotion = useReducedMotion();
  const regionId = useId();
  const parsed = useMemo(() => parseAiTellFlags(aiTellFlags), [aiTellFlags]);
  const items = useMemo(() => buildItems(parsed), [parsed]);
  const scores = useMemo(() => voiceprintFromScan(aiTellFlags), [aiTellFlags]);

  const warningCount = items.filter((i) => i.severity === "warning").length;
  const infoCount = items.length - warningCount;
  const isClean = warningCount === 0;
  const hasFactCheck = items.some((i) => i.ruleId === FACT_CHECK_RULE_ID);

  // Fact-check is the flag most worth acting on, so it opens expanded.
  const [open, setOpen] = useState(hasFactCheck);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  function toggleStrip() {
    setOpen((o) => !o);
    setActiveKey(null);
  }

  function openChip(key: string) {
    if (open && activeKey === key) {
      setOpen(false);
      setActiveKey(null);
      return;
    }
    setOpen(true);
    setActiveKey(key);
  }

  const duration = reduceMotion ? 0 : 0.2;

  return (
    <section
      aria-label="Quality scan"
      className={cn("ink-edge overflow-hidden rounded-[10px] bg-surface", className)}
    >
      <button
        type="button"
        onClick={toggleStrip}
        aria-expanded={open}
        aria-controls={regionId}
        className="flex w-full flex-col gap-2 px-3 py-2.5 text-left outline-none focus-visible:bg-paper-sunk"
      >
        <span className="flex w-full items-center justify-between">
          <span className="eyebrow text-ink-2">Quality scan</span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "h-4 w-4 text-ink-2 transition-transform duration-200 motion-reduce:transition-none",
              open && "rotate-180",
            )}
          />
        </span>
        <span className="flex w-full items-center gap-3">
          <Voiceprint size={40} {...scores} />
          {isClean ? (
            <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
              <Badge variant="corroborated">Passed</Badge>
              <span className="text-[12px] text-ink-2">
                {RULES_CHECKED} rules checked
                {infoCount > 0 ? ` · ${infoCount} auto-cleaned` : ""}
              </span>
            </span>
          ) : (
            <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
              <Badge variant="flagged" className="gap-1.5">
                <AlertTriangle aria-hidden="true" className="h-3 w-3" />
                {warningCount} flag{warningCount === 1 ? "" : "s"} to review
              </Badge>
              <span className="text-[12px] text-ink-2">
                Review before approving
                {infoCount > 0 ? ` · ${infoCount} auto-cleaned` : ""}
              </span>
            </span>
          )}
        </span>
      </button>

      {items.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5 px-3 pb-2.5">
          {items.map((item) => {
            const isWarning = item.severity === "warning";
            const isActive = open && activeKey === item.key;
            return (
              <li key={item.key} className="max-w-full">
                <button
                  type="button"
                  onClick={() => openChip(item.key)}
                  aria-controls={regionId}
                  aria-expanded={isActive}
                  title={item.label}
                  className={cn(
                    "inline-flex max-w-full items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium leading-5 text-ink transition-shadow",
                    "outline-none hover:shadow-[var(--sh-xs)] focus-visible:shadow-[var(--sh-xs)]",
                    isWarning ? "ink-edge bg-p-coral" : "ink-edge-dashed bg-transparent",
                    isActive && "shadow-[var(--sh-xs)]",
                  )}
                >
                  <span className="truncate">{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {showRescanNote && items.length > 0 ? (
        <p className="px-3 pb-2.5 text-[11px] text-ink-2">
          Re-scanned with current rules — flags may differ from the original.
        </p>
      ) : null}

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="detail"
            id={regionId}
            role="region"
            aria-label="Quality scan details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="border-t-2 border-ink">
              {items.map((item) => (
                <div
                  key={item.key}
                  className={cn(
                    "border-b border-hairline px-3 py-2.5",
                    activeKey === item.key && "bg-paper-sunk",
                  )}
                >
                  <p
                    className={cn(
                      "eyebrow font-mono text-ink-2",
                      item.severity === "info" && "opacity-80",
                    )}
                  >
                    {item.ruleId}
                    {item.severity === "info" ? " · auto-cleaned" : ""}
                  </p>
                  {item.ruleId === FACT_CHECK_RULE_ID ? (
                    <div className="mt-1.5">
                      <FactCheckFlagBody details={item.details} />
                    </div>
                  ) : (
                    <>
                      <p className="mt-1 text-[13px] leading-snug text-ink">
                        {item.kind === "voice" ? "Voice flag" : item.message}
                      </p>
                      {item.details ? (
                        <p className="mt-0.5 text-[12px] leading-snug text-ink-2">{item.details}</p>
                      ) : null}
                    </>
                  )}
                </div>
              ))}

              <div className="px-3 py-2.5">
                <p className="eyebrow mb-2 text-ink-2">Voiceprint</p>
                <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {AXES.map((a) => (
                    <li key={a.key} className="flex items-center gap-2 text-[12px] text-ink">
                      <span
                        aria-hidden="true"
                        className="inline-block size-3 shrink-0 rounded-full border-2 border-ink"
                        style={{ backgroundColor: a.color }}
                      />
                      <span>{a.label}</span>
                      <span className="ml-auto tabular-nums text-ink-2">
                        {Math.round(scores[a.key] * 100)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

export default QualityFlags;
