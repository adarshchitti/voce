import type { RuleContext } from "@/lib/ai/quality-rules";
import {
  type QualityScanResult,
  type QualityScanStructural,
  type ScanFlag,
  type ScanOptions,
  runQualityScan,
} from "@/lib/ai/quality-scan";

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
