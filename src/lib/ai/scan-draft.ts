import Anthropic from "@anthropic-ai/sdk";
import {
  AI_TELL_SCAN_PROMPT,
  DEFAULT_SENSITIVITY,
  type SensitivitySettings,
} from "@/lib/ai/ai-tells";

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");
  return new Anthropic({ apiKey });
}

export interface ScanResult {
  flaggedWords: string[];
  flaggedPhrases: string[];
  hasEngagementBeg: boolean;
  engagementBegFound: string | null;
  structural: {
    sentenceCV: number | null;
    lowSentenceVariance: boolean;
    broetryPct: number | null;
    broetryDetected: boolean;
    antithesisCount: number;
    tricolonCount: number;
    paragraphUniform: boolean;
    lacksConcreteness: boolean;
    hashtagCount: number;
    charCount: number;
    charCountOutOfRange: boolean;
    lowContractionRate: boolean;
  };
  markdownStripped: boolean;
  clean: boolean;
  structureIssues: string[];
}

// ─── Category A: Lexical flags ────────────────────────────────────────────
const LEXICAL_FLAG_WORDS = [
  "delve",
  "leverage",
  "utilize",
  "utilise",
  "underscore",
  "navigate",
  "foster",
  "unleash",
  "supercharge",
  "revolutionize",
  "revolutionise",
  "unlock",
  "elevate",
  "embark",
  "streamline",
  "empower",
  "harness",
  "spearhead",
  "pioneer",
  "catalyze",
  "catalyse",
  "pivotal",
  "paramount",
  "crucial",
  "groundbreaking",
  "transformative",
  "holistic",
  "robust",
  "seamless",
  "comprehensive",
  "nuanced",
  "multifaceted",
  "intricate",
  "cutting-edge",
  "game-changing",
  "unprecedented",
  "dynamic",
  "meticulous",
  "commendable",
  "landscape",
  "ecosystem",
  "realm",
  "paradigm",
  "synergy",
  "alignment",
  "cornerstone",
  "testament",
  "beacon",
  "tapestry",
  "confluence",
  "notably",
  "importantly",
  "crucially",
  "fundamentally",
  "essentially",
  "ultimately",
  "undoubtedly",
];

// ─── Category B1: Phrase flags ────────────────────────────────────────────
const PHRASE_FLAGS = [
  "i'll be honest",
  "here's the hard truth",
  "truth bomb",
  "real talk",
  "unpopular opinion",
  "hot take",
  "the magic happens when",
  "true growth comes from",
  "at the end of the day",
  "a testament to",
  "speaks volumes",
  "now more than ever",
  "in today's rapidly evolving",
  "let's dive in",
  "here's the kicker",
  "the bottom line is",
  "this changes everything",
  "game-changer",
  "moving the needle",
  "this is what most people miss",
  "many leaders",
  "most professionals",
  "we've all been there",
  "everyone knows",
  "it's important to note",
  "in conclusion",
  "to summarize",
  "to summarise",
  "moreover,",
  "furthermore,",
];

// ─── Category B2: Engagement begs ─────────────────────────────────────────
const ENGAGEMENT_BEG_PATTERNS = [
  /what do you think\??/i,
  /drop a comment/i,
  /let me know (in the comments|below|your thoughts)/i,
  /comment (yes|below|your)/i,
  /agree\??$/im,
  /thoughts\??$/im,
  /tag someone/i,
  /repost if/i,
  /share if you/i,
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripMarkdown(text: string): { text: string; stripped: boolean } {
  const original = text;
  let result = text.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1");
  result = result.replace(/^#{1,6}\s+/gm, "");
  result = result.replace(/`([^`]+)`/g, "$1");
  return { text: result, stripped: result !== original };
}

function computeSentenceCV(text: string): number | null {
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.split(/\s+/).length >= 2);

  if (sentences.length < 3) return null;

  const lengths = sentences.map((s) => s.split(/\s+/).length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  if (mean === 0) return null;

  const variance = lengths.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / lengths.length;
  return Math.sqrt(variance) / mean;
}

function detectBroetry(text: string): number {
  const lines = text.split(/\r?\n/);
  let nonBlankLines = 0;
  let broetryLines = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    nonBlankLines++;
    const wordCount = line.split(/\s+/).filter(Boolean).length;
    const nextLine = lines[i + 1];
    const nextBlank = nextLine === undefined || nextLine.trim() === "";
    if (wordCount >= 1 && wordCount <= 5 && nextBlank) {
      broetryLines++;
    }
  }

  return nonBlankLines > 0 ? broetryLines / nonBlankLines : 0;
}

function countAntithesis(text: string): number {
  const patterns = [
    /\bnot\b.{1,40}\bbut\b/gi,
    /it'?s not.{1,40}it'?s/gi,
    /most people.{1,40}(the best|winners|leaders)/gi,
    /stop.{1,40}start/gi,
  ];
  let count = 0;
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    count += matches?.length ?? 0;
  }
  return count;
}

function countTricolon(text: string): number {
  const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 0);
  let count = 0;
  for (let i = 0; i < sentences.length - 2; i++) {
    const a = sentences[i].split(/\s+/).length;
    const b = sentences[i + 1].split(/\s+/).length;
    const c = sentences[i + 2].split(/\s+/).length;
    if (a <= 8 && b <= 8 && c <= 8 && a >= 2 && b >= 2 && c >= 2) {
      count++;
    }
  }
  return count;
}

function checkParagraphUniformity(text: string): boolean {
  const paragraphs = text.split(/\n\n+/).map((p) => p.trim()).filter((p) => p.length > 0);
  if (paragraphs.length < 2) return false;

  const wordCounts = paragraphs.map((p) => p.split(/\s+/).filter(Boolean).length);
  const hasLong = wordCounts.some((c) => c >= 40);
  const hasShort = wordCounts.some((c) => c <= 10);

  return !hasLong && !hasShort;
}

function checkConcreteness(text: string): boolean {
  const roundNumbers = new Set([3, 5, 7, 10, 50, 100, 1000]);

  const hasProperNoun = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/.test(text);
  const numberMatches = text.match(/\b\d+(?:\.\d+)?(?:%|k|M|B)?\b/g) ?? [];
  const hasNonRoundNumber = numberMatches.some((n) => {
    const parsed = parseFloat(n.replace(/[kMB%]/gi, ""));
    return !isNaN(parsed) && !roundNumbers.has(parsed);
  });

  return !hasProperNoun && !hasNonRoundNumber;
}

function checkContractionRate(text: string): boolean {
  const firstPersonSentences = text.split(/[.!?]+/).filter((s) => /\bI\b/i.test(s));

  if (firstPersonSentences.length < 2) return false;

  const contractionRe = /\b(I'm|I've|I'd|I'll|don't|can't|it's|isn't|wasn't|wouldn't|couldn't|didn't)\b/i;
  const withContractions = firstPersonSentences.filter((s) => contractionRe.test(s));

  const rate = withContractions.length / firstPersonSentences.length;
  return rate < 0.3;
}

export function runCodeScan(
  draftText: string,
  sensitivity: SensitivitySettings = DEFAULT_SENSITIVITY,
): Omit<ScanResult, "clean"> & { strippedText: string } {
  const { text: strippedText, stripped: markdownStripped } = stripMarkdown(draftText);
  const text = strippedText;
  const lowerText = text.toLowerCase();

  const flaggedWords = sensitivity.tellFlagBannedWords
    ? LEXICAL_FLAG_WORDS.filter((word) => {
        const regex = new RegExp(`\\b${escapeRegExp(word)}\\b`, "i");
        return regex.test(text);
      })
    : [];

  const flaggedPhrases = PHRASE_FLAGS.filter((phrase) => lowerText.includes(phrase.toLowerCase()));

  let hasEngagementBeg = false;
  let engagementBegFound: string | null = null;
  if (sensitivity.tellFlagEngagementBeg) {
    for (const pattern of ENGAGEMENT_BEG_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        hasEngagementBeg = true;
        engagementBegFound = match[0];
        break;
      }
    }
  }

  const sentenceCV = computeSentenceCV(text);
  const broetryPct = detectBroetry(text);
  const antithesisCount = countAntithesis(text);
  const tricolonCount = countTricolon(text);
  const charCount = text.length;
  const hashtagCount = (text.match(/#\w+/g) ?? []).length;

  const structural = {
    sentenceCV,
    lowSentenceVariance: sentenceCV !== null && sentenceCV < 0.4,
    broetryPct,
    broetryDetected: broetryPct > 0.6,
    antithesisCount,
    tricolonCount,
    paragraphUniform: checkParagraphUniformity(text),
    lacksConcreteness: checkConcreteness(text),
    hashtagCount,
    charCount,
    charCountOutOfRange: charCount < 1200 || charCount > 2800,
    lowContractionRate: checkContractionRate(text),
  };

  return {
    strippedText,
    flaggedWords,
    flaggedPhrases,
    hasEngagementBeg,
    engagementBegFound,
    structural,
    markdownStripped,
    structureIssues: [],
  };
}

export function serializeAiTellFlags(scanResult: ScanResult): string | null {
  if (scanResult.clean) return null;
  return JSON.stringify({
    words: scanResult.flaggedWords,
    phrases: scanResult.flaggedPhrases,
    structural: scanResult.structural,
    structureIssues: scanResult.structureIssues,
    markdownStripped: scanResult.markdownStripped,
  });
}

/** Merge scan output with optional voice calibration flags (personalize flow). */
export function buildAiTellFlagsJson(scanResult: ScanResult, voiceFlags?: string[] | null): string | null {
  const payload: Record<string, unknown> = {};
  if (!scanResult.clean) {
    payload.words = scanResult.flaggedWords;
    payload.phrases = scanResult.flaggedPhrases;
    payload.structural = scanResult.structural;
    payload.structureIssues = scanResult.structureIssues;
    payload.markdownStripped = scanResult.markdownStripped;
  }
  if (voiceFlags?.length) payload.voice = voiceFlags;
  if (Object.keys(payload).length === 0) return null;
  return JSON.stringify(payload);
}

export async function scanDraftForAITells(
  draftText: string,
  sensitivity: SensitivitySettings = DEFAULT_SENSITIVITY,
  calibration?: {
    paragraphStyle?: string | null;
    listUsage?: string | null;
    usesEmDash?: boolean | null;
  },
): Promise<ScanResult> {
  const codeScan = runCodeScan(draftText, sensitivity);

  if (codeScan.hasEngagementBeg) {
    return {
      flaggedWords: codeScan.flaggedWords,
      flaggedPhrases: codeScan.flaggedPhrases,
      hasEngagementBeg: true,
      engagementBegFound: codeScan.engagementBegFound,
      structural: codeScan.structural,
      markdownStripped: codeScan.markdownStripped,
      clean: false,
      structureIssues: [`Engagement beg detected: "${codeScan.engagementBegFound}"`],
    };
  }

  let llmFlaggedWords: string[] = [];
  let llmStructureIssues: string[] = [];

  try {
    const client = getClient();
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      system: "You are a content quality checker. Return only valid JSON. No preamble.",
      messages: [
        {
          role: "user",
          content: AI_TELL_SCAN_PROMPT(codeScan.strippedText, sensitivity, calibration),
        },
      ],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const clean = text.replace(/```json\n?|```\n?/g, "").trim();
    const llmResult = JSON.parse(clean) as { flaggedWords?: string[]; structureIssues?: string[] };
    llmFlaggedWords = llmResult.flaggedWords ?? [];
    llmStructureIssues = llmResult.structureIssues ?? [];
  } catch {
    console.error("AI tell LLM scan failed — using code scan only");
  }

  const allFlaggedWords = [...new Set([...codeScan.flaggedWords, ...llmFlaggedWords])];

  const structureIssues: string[] = [...llmStructureIssues];
  if (codeScan.structural.lowSentenceVariance) {
    structureIssues.push("Uniform sentence length — reads as AI rhythm");
  }
  if (codeScan.structural.broetryDetected) {
    structureIssues.push("AI accordion format — most lines are 1-5 words");
  }
  if (codeScan.structural.antithesisCount > 1) {
    structureIssues.push(`Antithesis overuse (${codeScan.structural.antithesisCount}× "not X, but Y" pattern)`);
  }
  if (codeScan.structural.tricolonCount > 1) {
    structureIssues.push(`Tricolon overuse (${codeScan.structural.tricolonCount}× three-parallel-line pattern)`);
  }
  if (codeScan.structural.paragraphUniform) {
    structureIssues.push("Paragraph length is uniform — no short or long paragraphs");
  }
  if (codeScan.structural.lacksConcreteness) {
    structureIssues.push("No proper nouns or non-round numbers — draft lacks specificity");
  }
  if (codeScan.structural.charCountOutOfRange) {
    structureIssues.push(`Character count ${codeScan.structural.charCount} outside target range (1200–2800)`);
  }
  if (codeScan.structural.lowContractionRate) {
    structureIssues.push("Low contraction rate in first-person sentences");
  }

  const isClean =
    allFlaggedWords.length === 0 &&
    codeScan.flaggedPhrases.length === 0 &&
    !codeScan.hasEngagementBeg &&
    structureIssues.length === 0 &&
    !codeScan.markdownStripped;

  return {
    flaggedWords: allFlaggedWords,
    flaggedPhrases: codeScan.flaggedPhrases,
    hasEngagementBeg: false,
    engagementBegFound: null,
    structural: codeScan.structural,
    markdownStripped: codeScan.markdownStripped,
    structureIssues,
    clean: isClean,
  };
}
