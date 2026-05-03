import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const searchMock = vi.fn();

vi.mock("@tavily/core", () => ({
  tavily: () => ({ search: searchMock }),
}));

beforeEach(() => {
  searchMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const FIXTURE_NEWS = {
  results: [
    {
      url: "https://example.com/article-1",
      title: "Example News One",
      content: "First example article content excerpt.",
      publishedDate: "2026-05-02T12:00:00Z",
    },
    {
      url: "https://example.com/article-2",
      title: "Example News Two",
      content: "Second example article content excerpt.",
      publishedDate: "2026-05-01T08:00:00Z",
    },
  ],
};

const FIXTURE_GENERAL = {
  results: [
    {
      url: "https://example.com/general-1",
      title: "Example General Result",
      content: "General search excerpt.",
    },
  ],
};

describe("fetchTavily (Phase 2 public API)", () => {
  it("returns news-shaped results when news has hits, never calls general search", async () => {
    searchMock.mockResolvedValueOnce(FIXTURE_NEWS);
    const { fetchTavily } = await import("@/lib/ai/tavily");
    const out = await fetchTavily({ query: "ai agents" });
    expect(searchMock).toHaveBeenCalledTimes(1);
    expect(searchMock).toHaveBeenCalledWith("ai agents", expect.objectContaining({ topic: "news", days: 3, maxResults: 5 }));
    expect(out).toMatchInlineSnapshot(`
      [
        {
          "dedupHash": "031d04c5b2734937cb917b635048fe9f637d8f5d31fb0235c9318d6fd9873794",
          "publishedAt": 2026-05-02T12:00:00.000Z,
          "sourceType": "tavily_news",
          "summary": "First example article content excerpt.",
          "title": "Example News One",
          "url": "https://example.com/article-1",
        },
        {
          "dedupHash": "851a7696bfae5c00733dc9fd7c2c1cc7e92914e20095c511bca11abad2228c69",
          "publishedAt": 2026-05-01T08:00:00.000Z,
          "sourceType": "tavily_news",
          "summary": "Second example article content excerpt.",
          "title": "Example News Two",
          "url": "https://example.com/article-2",
        },
      ]
    `);
  });

  it("falls back to general search when news returns 0 hits", async () => {
    searchMock.mockResolvedValueOnce({ results: [] });
    searchMock.mockResolvedValueOnce(FIXTURE_GENERAL);
    const { fetchTavily } = await import("@/lib/ai/tavily");
    const out = await fetchTavily({ query: "obscure topic" });
    expect(searchMock).toHaveBeenCalledTimes(2);
    expect(searchMock.mock.calls[0][1]).toMatchObject({ topic: "news", days: 3 });
    expect(searchMock.mock.calls[1][1]).toMatchObject({ topic: "general" });
    expect(out).toHaveLength(1);
    expect(out[0].sourceType).toBe("tavily_search");
    expect(out[0].publishedAt).toBeNull();
  });

  it("respects custom maxResults and timeRangeDays", async () => {
    searchMock.mockResolvedValueOnce({ results: [] });
    searchMock.mockResolvedValueOnce({ results: [] });
    const { fetchTavily } = await import("@/lib/ai/tavily");
    await fetchTavily({ query: "x", maxResults: 12, timeRangeDays: 7 });
    expect(searchMock).toHaveBeenCalledWith("x", expect.objectContaining({ maxResults: 12, days: 7 }));
  });

  it("propagates SDK errors to the caller (no internal swallowing)", async () => {
    searchMock.mockRejectedValueOnce(new Error("rate limited"));
    const { fetchTavily } = await import("@/lib/ai/tavily");
    await expect(fetchTavily({ query: "x" })).rejects.toThrow(/rate limited/);
  });

  it("contract: returned items carry the fields quick-generate and the daily flow consume", async () => {
    searchMock.mockResolvedValueOnce(FIXTURE_NEWS);
    const { fetchTavily } = await import("@/lib/ai/tavily");
    const [first] = await fetchTavily({ query: "x" });
    // These are exactly the fields read at call sites; lock them.
    expect(Object.keys(first).sort()).toEqual([
      "dedupHash",
      "publishedAt",
      "sourceType",
      "summary",
      "title",
      "url",
    ]);
  });
});

describe("fetchTavilyItems (legacy lower-level, still used by global research cron)", () => {
  it("maps news results unchanged from the SDK shape", async () => {
    searchMock.mockResolvedValueOnce(FIXTURE_NEWS);
    const { fetchTavilyItems } = await import("@/lib/ai/tavily");
    const out = await fetchTavilyItems("anything", "news");
    expect(searchMock).toHaveBeenCalledWith("anything", expect.objectContaining({ topic: "news", maxResults: 10 }));
    expect(out[0].sourceType).toBe("tavily_news");
    expect(out[0].url).toBe(FIXTURE_NEWS.results[0].url);
  });

  it("maps general results to tavily_search sourceType", async () => {
    searchMock.mockResolvedValueOnce(FIXTURE_GENERAL);
    const { fetchTavilyItems } = await import("@/lib/ai/tavily");
    const out = await fetchTavilyItems("anything", "search");
    expect(searchMock).toHaveBeenCalledWith("anything", expect.objectContaining({ topic: "general" }));
    expect(out[0].sourceType).toBe("tavily_search");
  });
});
