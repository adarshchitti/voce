import { tavily } from "@tavily/core";
import crypto from "node:crypto";

export type TavilyResult = {
  url: string;
  title: string;
  summary: string;
  sourceType: "tavily_news" | "tavily_search";
  publishedAt: Date | null;
  dedupHash: string;
};

function getClient() {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("Missing TAVILY_API_KEY");
  return tavily({ apiKey });
}

export function buildDedupHash(url: string, title: string): string {
  return crypto.createHash("sha256").update(`${url}::${title}`).digest("hex");
}

type RawTavilyHit = { url: string; title: string; content?: string; publishedDate?: string };

function mapResult(r: RawTavilyHit, sourceType: TavilyResult["sourceType"]): TavilyResult {
  return {
    url: r.url,
    title: r.title,
    summary: r.content?.slice(0, 500) ?? "",
    sourceType,
    publishedAt: r.publishedDate ? new Date(r.publishedDate) : null,
    dedupHash: buildDedupHash(r.url, r.title),
  };
}

/**
 * Legacy lower-level call used by the global research cron (Phase 1) and as
 * the implementation backing `fetchTavily`. Kept exported because the global
 * research cron deliberately fetches BOTH news and search separately and
 * accumulates results, which `fetchTavily`'s news-first/general-fallback
 * behaviour can't represent.
 */
export async function fetchTavilyItems(query: string, type: "news" | "search"): Promise<TavilyResult[]> {
  const client = getClient();
  const results = await client.search(query, {
    topic: type === "news" ? "news" : "general",
    maxResults: 10,
    includeAnswer: false,
  });
  const sourceType = type === "news" ? "tavily_news" : "tavily_search";
  return results.results.map((r) => mapResult(r, sourceType));
}

/**
 * Phase 2 public API used by quick generate and the per-user daily flow.
 * News-first with general-search fallback if news is empty. Recency window
 * (`timeRangeDays`) only applies to the news topic; the general fallback
 * does not constrain by date.
 */
export async function fetchTavily(input: {
  query: string;
  maxResults?: number;
  timeRangeDays?: number;
}): Promise<TavilyResult[]> {
  const maxResults = input.maxResults ?? 5;
  const timeRangeDays = input.timeRangeDays ?? 3;
  const client = getClient();

  const newsResults = await client.search(input.query, {
    topic: "news",
    days: timeRangeDays,
    maxResults,
    includeAnswer: false,
  } as Parameters<ReturnType<typeof tavily>["search"]>[1]);
  if (newsResults.results.length > 0) {
    return newsResults.results.map((r) => mapResult(r, "tavily_news"));
  }

  const searchResults = await client.search(input.query, {
    topic: "general",
    maxResults,
    includeAnswer: false,
  });
  return searchResults.results.map((r) => mapResult(r, "tavily_search"));
}
