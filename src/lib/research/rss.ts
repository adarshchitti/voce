import Parser from "rss-parser";
import crypto from "node:crypto";

const parser = new Parser();

export async function fetchRssItems(feedUrl: string) {
  try {
    const feed = await parser.parseURL(feedUrl);
    return (feed.items ?? [])
      .map((item) => ({
        url: item.link ?? "",
        title: item.title ?? "",
        summary: item.contentSnippet?.slice(0, 500) ?? "",
        sourceType: "rss" as const,
        publishedAt: item.pubDate ? new Date(item.pubDate) : null,
        dedupHash: crypto.createHash("sha256").update(`${item.link ?? ""}::${item.title ?? ""}`).digest("hex"),
      }))
      .filter((i) => i.url && i.title);
  } catch {
    console.error(`RSS fetch failed for ${feedUrl}`);
    return [];
  }
}
