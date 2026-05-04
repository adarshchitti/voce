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

// Maps the new ScanFlag[] to the legacy {words, phrases, structureIssues}
// JSON shape consumed by DraftCard.tsx. The shape is kept stable here so
// the inbox UI doesn't break before its overhaul in Step 6.
function flagsToLegacyShape(flags: ScanFlag[]): {
  words: string[];
  phrases: string[];
  structureIssues: string[];
} {
  const words: string[] = [];
  const phrases: string[] = [];
  const structureIssues: string[] = [];
  for (const flag of flags) {
    if (flag.ruleId === "struct_markdown_leak") continue;
    if (flag.category === "lexical") {
      if (flag.details) {
        for (const w of flag.details.split(",").map((s) => s.trim()).filter(Boolean)) {
          words.push(w);
        }
      }
    } else if (flag.category === "phrase") {
      if (flag.details) phrases.push(flag.details);
    } else {
      structureIssues.push(flag.details ? `${flag.description}: ${flag.details}` : flag.description);
    }
  }
  return {
    words: [...new Set(words)],
    phrases: [...new Set(phrases)],
    structureIssues,
  };
}

export function serializeAiTellFlags(scanResult: ScanResult): string | null {
  if (scanResult.clean && !scanResult.markdownStripped) return null;
  const legacy = flagsToLegacyShape(scanResult.flags);
  return JSON.stringify({
    words: legacy.words,
    phrases: legacy.phrases,
    structural: scanResult.structural,
    structureIssues: legacy.structureIssues,
    markdownStripped: scanResult.markdownStripped,
  });
}

// Used by the personalize route to merge voice-calibration flags alongside
// the structural scan.
export function buildAiTellFlagsJson(
  scanResult: ScanResult,
  voiceFlags?: string[] | null,
): string | null {
  const payload: Record<string, unknown> = {};
  if (!scanResult.clean || scanResult.markdownStripped) {
    const legacy = flagsToLegacyShape(scanResult.flags);
    payload.words = legacy.words;
    payload.phrases = legacy.phrases;
    payload.structural = scanResult.structural;
    payload.structureIssues = legacy.structureIssues;
    payload.markdownStripped = scanResult.markdownStripped;
  }
  if (voiceFlags?.length) payload.voice = voiceFlags;
  if (Object.keys(payload).length === 0) return null;
  return JSON.stringify(payload);
}
