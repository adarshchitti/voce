import type { RuleContext } from "@/lib/ai/quality-rules";
import {
  type QualityScanResult,
  type QualityScanStructural,
  type ScanFlag,
  type ScanOptions,
  runQualityScan,
} from "@/lib/ai/quality-scan";
import {
  verifyFactualClaims,
  type FactCheckOutcome,
  type FactCheckSourceItem,
  type PermittedClaims,
} from "@/lib/ai/fact-check";

// Public surface for the post-generation scan. Now a thin sync wrapper
// around runQualityScan; the previous Haiku LLM scan and SensitivitySettings
// shim were deleted in Step 2 of the quality-rules rebuild.

export interface ScanResult {
  draftText: string;            // post-strip (markdown removed silently)
  flags: ScanFlag[];
  hasEngagementBeg: boolean;
  engagementBegFound: string | null;
  markdownStripped: boolean;
  clean: boolean;
  structural: QualityScanStructural;
}

export function scanDraftForAITells(
  draftText: string,
  ctx: RuleContext,
  opts: ScanOptions = {},
): ScanResult {
  const result: QualityScanResult = runQualityScan(draftText, ctx, opts);
  return {
    draftText: result.cleanedText,
    flags: result.flags,
    hasEngagementBeg: result.hasEngagementBeg,
    engagementBegFound: result.engagementBegFound,
    markdownStripped: result.markdownStripped,
    clean: result.clean,
    structural: result.structural,
  };
}

// JSON shape persisted in draft_queue.ai_tell_flags. One entry per active
// scan flag, mirroring the QUALITY_RULES structure (rule_id, severity,
// action, message). Severity is derived from the rule's action:
//   action='flag'        → severity='warning' (user reviews)
//   action='auto_strip'  → severity='info'    (already cleaned, fyi)
//   action='regenerate'  → severity='info'    (already regenerated, fyi)
//
// `voice` carries voice-calibration flags from the personalize / regen
// scoring pass — separate origin, kept out of the main flags array so the
// inbox UI can render them under a distinct header if it wants.
export type SerializedFlag = {
  ruleId: string;
  category: "lexical" | "phrase" | "structural";
  severity: "info" | "warning";
  action: "flag" | "auto_strip" | "regenerate";
  message: string;
  details?: string;
};

export type SerializedAiTellFlags = {
  flags: SerializedFlag[];
  voice?: string[];
};

function severityFromAction(action: ScanFlag["action"]): SerializedFlag["severity"] {
  return action === "flag" ? "warning" : "info";
}

function flagsToSerialized(flags: ScanFlag[]): SerializedFlag[] {
  return flags.map((f) => ({
    ruleId: f.ruleId,
    category: f.category,
    severity: severityFromAction(f.action),
    action: f.action,
    message: f.description,
    ...(f.details ? { details: f.details } : {}),
  }));
}

export function serializeAiTellFlags(scanResult: ScanResult): string | null {
  if (scanResult.flags.length === 0) return null;
  const payload: SerializedAiTellFlags = {
    flags: flagsToSerialized(scanResult.flags),
  };
  return JSON.stringify(payload);
}

// Async fact-check pass. Runs after the synchronous quality scan and, when
// a source article is available, calls Haiku to verify specific claims in the
// draft against the source. Returns a new ScanResult with the fact-check flag
// merged into its flags array (when claims are unsupported) plus a
// FactCheckOutcome describing what happened — telemetry the daily cron paths
// thread back into GenerateUserResult.
//
// Optional `permittedClaims` carries pre-approved first-person experience
// (typically the personal-context component the personalize route selected).
// When supplied, the verifier treats matching first-person claims as
// supported, so the personalization feature doesn't trigger a false-positive
// flag on the very claim it just injected.
//
// Architectural note: we keep this out of runQualityScan / SCAN_IMPLEMENTATIONS
// because those are synchronous and source-unaware. Adding async + a new
// per-rule input would force a refactor of every existing scan implementation
// and the prompt-builder ScanFn type. Phase 1 keeps the sync scan untouched
// and runs the verifier as a parallel async path; if Phase 2 adds more
// source-aware async checks, we'll consider unifying the signatures.
//
// Fail-open: a null sourceItem (or a sourceItem with no content) returns the
// original ScanResult and a "skipped" outcome. Verifier errors are logged
// inside verifyFactualClaims and bubble up as an outcome with flag=null.
export async function applyFactCheck(
  scanResult: ScanResult,
  sourceItem: FactCheckSourceItem | null,
  permittedClaims: PermittedClaims | null = null,
): Promise<{ scanResult: ScanResult; outcome: FactCheckOutcome }> {
  const outcome = await verifyFactualClaims(scanResult.draftText, sourceItem, permittedClaims);
  if (!outcome.flag) return { scanResult, outcome };
  const merged: ScanResult = {
    ...scanResult,
    flags: [...scanResult.flags, outcome.flag],
    clean: false,
  };
  return { scanResult: merged, outcome };
}

// Convenience helper for call sites that have a partial source descriptor and
// want to either run the verifier or skip with a structured "no source" log.
// Returns the (possibly-merged) ScanResult plus the outcome. The caller is
// responsible for deciding what to do with the outcome (typically: aggregate
// into GenerateUserResult for cron telemetry, or discard for ad-hoc routes).
//
// `permittedClaims` is optional and forwarded as-is. Generation flows pass
// null (default); the personalize route passes the selected component when
// the targeted-angle path fired.
export async function runFactCheckOrSkip(
  scanResult: ScanResult,
  sourceItem: { title?: string | null; url?: string | null; content?: string | null } | null,
  contextLabel: string,
  permittedClaims: PermittedClaims | null = null,
): Promise<{ scanResult: ScanResult; outcome: FactCheckOutcome }> {
  const hasContent = !!sourceItem?.content?.trim();
  const hasTitle = !!sourceItem?.title?.trim();
  const hasUrl = !!sourceItem?.url?.trim();
  if (!hasContent || !hasTitle || !hasUrl) {
    console.info(`[fact-check] verifier skipped (${contextLabel}): no source available`);
    return applyFactCheck(scanResult, null, permittedClaims);
  }
  return applyFactCheck(
    scanResult,
    {
      title: sourceItem!.title!.trim(),
      url: sourceItem!.url!.trim(),
      content: sourceItem!.content!.trim(),
    },
    permittedClaims,
  );
}

// Used by personalize / regenerate to merge voice-calibration flags alongside
// the quality-scan flags. Voice flags originate from scoreVoiceDetailed
// (a separate Haiku pass) and don't fit the rule schema, so they get their
// own array.
export function buildAiTellFlagsJson(
  scanResult: ScanResult,
  voiceFlags?: string[] | null,
): string | null {
  const hasFlags = scanResult.flags.length > 0;
  const hasVoice = (voiceFlags?.length ?? 0) > 0;
  if (!hasFlags && !hasVoice) return null;
  const payload: SerializedAiTellFlags = {
    flags: hasFlags ? flagsToSerialized(scanResult.flags) : [],
    ...(hasVoice ? { voice: voiceFlags ?? [] } : {}),
  };
  return JSON.stringify(payload);
}
