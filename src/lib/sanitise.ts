// Known prompt injection patterns — strip before any user content hits LLM
const INJECTION_PATTERNS = [
  /ignore\s+(previous|all|above|prior)\s+instructions?/gi,
  /you\s+are\s+now\s+/gi,
  /act\s+as\s+(a\s+)?(different|new|another)/gi,
  /system\s*:/gi,
  /assistant\s*:/gi,
  /human\s*:/gi,
  /\[INST\]/gi,
  /\[\/INST\]/gi,
  /<\|im_start\|>/gi,
  /<\|im_end\|>/gi,
  /###\s*(instruction|system|prompt)/gi,
  /disregard\s+(all\s+)?(previous|prior|above)/gi,
  /forget\s+(everything|all|your\s+instructions)/gi,
  /new\s+instructions?\s*:/gi,
  /override\s+(previous\s+)?(instructions?|rules?)/gi,
];

// Strip HTML tags
function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, "").trim();
}

// Strip prompt injection patterns
function stripInjection(text: string): string {
  let clean = text;
  for (const pattern of INJECTION_PATTERNS) {
    clean = clean.replace(pattern, "[removed]");
  }
  return clean;
}

// Truncate to max length, trim whitespace
function truncate(text: string, maxLength: number): string {
  return text.trim().slice(0, maxLength);
}

// Sanitise a LinkedIn sample post
// Must be plain text, reasonable length, not code
export function sanitiseSamplePost(text: string): string {
  let clean = stripHtml(text);
  clean = stripInjection(clean);
  // Remove code blocks
  clean = clean.replace(/```[\s\S]*?```/g, "");
  clean = clean.replace(/`[^`]*`/g, "");
  // Truncate to LinkedIn post limit
  clean = truncate(clean, 3000);
  return clean;
}

// Sanitise short freetext fields (goal, audience, personal context, user notes)
export function sanitiseShortText(text: string, maxLength: number): string {
  let clean = stripHtml(text);
  clean = stripInjection(clean);
  clean = truncate(clean, maxLength);
  return clean;
}

// Sanitise topic label — alphanumeric, spaces, basic punctuation only
export function sanitiseTopicLabel(text: string): string {
  let clean = text.replace(/[^a-zA-Z0-9\s\-_.,&()]/g, "");
  clean = truncate(clean, 60);
  return clean;
}

// Sanitise Tavily query — no special chars that could break search
export function sanitiseTavilyQuery(text: string): string {
  let clean = text.replace(/[<>{}[\]\\|^~`]/g, "");
  clean = stripInjection(clean);
  clean = truncate(clean, 150);
  return clean;
}

// Sanitise regeneration instruction
export function sanitiseInstruction(text: string): string {
  let clean = stripHtml(text);
  clean = stripInjection(clean);
  clean = truncate(clean, 300);
  return clean;
}

// Sanitise banned words — each entry is a short freetext term the user wants
// banned from generation. Run through the same defence as other freetext: HTML
// tags stripped, prompt-injection markers stripped, length capped at 50 chars,
// max 50 entries. Punctuation and Unicode (em dash, smart quotes, accents,
// emoji, etc.) survive intentionally — they're legitimate things to ban,
// not injection vectors. The previous regex `[^a-zA-Z0-9\s\-']` was too narrow
// and silently dropped em dashes etc. on save; that defect is what motivated
// this relaxation.
export function sanitiseBannedWords(words: string[]): string[] {
  return words
    .map((w) => sanitiseShortText(w, FIELD_LIMITS.bannedWordItem))
    .filter((w) => w.length > 0)
    .slice(0, 50);
}

// Validate that a sample post looks like LinkedIn content
// Returns true if it passes basic checks
export function isValidSamplePost(text: string): boolean {
  const clean = text.trim();
  if (clean.length < 100) return false; // too short
  if (clean.length > 3000) return false; // too long (LinkedIn limit)
  // Must be mostly printable characters
  const printableRatio = (clean.match(/[\x20-\x7E\n]/g) ?? []).length / clean.length;
  if (printableRatio < 0.8) return false;
  return true;
}

// Field length limits — single source of truth
export const FIELD_LIMITS = {
  samplePost: 3000,
  goal: 300,
  targetAudience: 200,
  personalContext: 500,
  userNotes: 500,
  topicLabel: 60,
  tavilyQuery: 150,
  bannedWordItem: 50,
  regenerationInstruction: 300,
  seriesDescription: 500,
  seriesGoal: 300,
  hookStyle: 120,
  paragraphStyle: 80,
  toneMarkerItem: 60,
} as const;

export function sanitiseToneMarkers(markers: string[]): string[] {
  return markers
    .map((m) => sanitiseShortText(m, FIELD_LIMITS.toneMarkerItem))
    .filter((m) => m.length > 0)
    .slice(0, 30);
}
