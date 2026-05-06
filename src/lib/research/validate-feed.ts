import { fetchRssItems } from "@/lib/research/rss";

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Thin adapter around fetchRssItems that adds a hard timeout.
 *
 * Returns ok=true iff the URL parsed as RSS and yielded at least one item
 * before the timeout. fetchRssItems itself swallows errors and returns []
 * on any failure (parse error, 404, etc.), so a length check is the
 * validation signal.
 *
 * Caveat: a parseable feed that happens to be empty right now is
 * indistinguishable from an invalid URL. Acceptable for source-suggestion
 * validation since real blogs always have entries.
 *
 * The Promise.race below times out the wait but does not cancel the
 * underlying parser.parseURL — it continues running in the background.
 * Tiny memory cost, no correctness issue.
 */
export async function validateFeed(
  url: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<{ ok: boolean }> {
  try {
    const items = await Promise.race([
      fetchRssItems(url),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("validate_feed_timeout")), timeoutMs),
      ),
    ]);
    return { ok: items.length > 0 };
  } catch {
    return { ok: false };
  }
}
