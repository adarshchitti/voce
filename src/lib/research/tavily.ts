import { tavily } from "@tavily/core";
import crypto from "node:crypto";

function getClient() {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("Missing TAVILY_API_KEY");
  return tavily({ apiKey });
}

export function buildDedupHash(url: string, title: string): string {
  return crypto.createHash("sha256").update(`${url}::${title}`).digest("hex");
}

export async function fetchTavilyItems(query: string, type: "news" | "search") {
  const client = getClient();
  const results = await client.search(query, {
    topic: type === "news" ? "news" : "general",
    maxResults: 10,
    includeAnswer: false,
  });
  return results.results.map((r) => ({
    url: r.url,
    title: r.title,
    summary: r.content?.slice(0, 500) ?? "",
    sourceType: type === "news" ? "tavily_news" : "tavily_search",
    publishedAt: r.publishedDate ? new Date(r.publishedDate) : null,
    dedupHash: buildDedupHash(r.url, r.title),
  }));
}
