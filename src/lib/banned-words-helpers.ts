// Pure helpers for the banned-words chip UI. Extracted so the add/remove
// behaviour can be unit-tested without React. The settings-client component
// owns the optimistic UI + network calls; these helpers only compute the
// next array and tell the caller whether anything changed.
//
// Mirrors the limits enforced server-side by sanitiseBannedWords:
//   - max 50 entries
//   - each entry max 50 chars
//   - duplicates rejected case-insensitively
// Letting the helper enforce these too keeps the UI from sending no-op
// requests and lets the chip count match what the server will actually save.

export const BANNED_WORDS_MAX_ENTRIES = 50;
export const BANNED_WORDS_MAX_LENGTH = 50;

export type AddBannedWordResult =
  | { ok: true; next: string[]; added: string }
  | { ok: false; reason: "empty" | "too_long" | "duplicate" | "limit" };

export function addBannedWord(current: string[], raw: string): AddBannedWordResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  if (trimmed.length > BANNED_WORDS_MAX_LENGTH) return { ok: false, reason: "too_long" };
  if (current.length >= BANNED_WORDS_MAX_ENTRIES) return { ok: false, reason: "limit" };
  const lower = trimmed.toLowerCase();
  if (current.some((w) => w.toLowerCase() === lower)) {
    return { ok: false, reason: "duplicate" };
  }
  return { ok: true, next: [...current, trimmed], added: trimmed };
}

export function removeBannedWord(current: string[], index: number): string[] {
  if (index < 0 || index >= current.length) return current;
  return current.filter((_, i) => i !== index);
}
