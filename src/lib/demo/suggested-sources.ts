/**
 * Demo-mode stand-in for POST /api/topics/[id]/suggest-sources.
 *
 * The real route asks the model for feed URLs and then validates each one over
 * the network. Here the feeds are hand-picked, real publisher domains and every
 * one is reported as validated. Nothing touches the model or the network.
 */
import { demoTopics } from "@/lib/demo/workspace";

type Candidate = { url: string; name: string; why: string };

const FEEDS = {
  simon: {
    url: "https://simonwillison.net/atom/everything/",
    name: "Simon Willison's Weblog",
    why: "Hands-on notes on new LLM tools and the failure modes people actually hit.",
  },
  hf: {
    url: "https://huggingface.co/blog/feed.xml",
    name: "Hugging Face Blog",
    why: "Engineering write-ups on serving, evaluation and open models.",
  },
  latent: {
    url: "https://www.latent.space/feed",
    name: "Latent Space",
    why: "Interviews and analysis from people building AI infrastructure.",
  },
  pragmatic: {
    url: "https://newsletter.pragmaticengineer.com/feed",
    name: "The Pragmatic Engineer",
    why: "How large engineering teams ship and run software, with real numbers.",
  },
  fowler: {
    url: "https://martinfowler.com/feed.atom",
    name: "Martin Fowler",
    why: "Durable writing on architecture, refactoring and delivery practice.",
  },
  stackoverflow: {
    url: "https://stackoverflow.blog/feed/",
    name: "Stack Overflow Blog",
    why: "Developer tooling trends and survey data.",
  },
} satisfies Record<string, Candidate>;

const INFRA = [FEEDS.latent, FEEDS.hf, FEEDS.simon, FEEDS.pragmatic];
const TOOLING = [FEEDS.pragmatic, FEEDS.fowler, FEEDS.stackoverflow, FEEDS.simon];
const GENERAL = [FEEDS.simon, FEEDS.pragmatic, FEEDS.latent, FEEDS.fowler];

export function demoSuggestedSources(topicId: string) {
  const topic = demoTopics().topics.find((t) => t.id === topicId);
  const hay = `${topic?.topicLabel ?? ""} ${topic?.tavilyQuery ?? ""}`.toLowerCase();
  const candidates: Candidate[] = /infra|inference|gpu|llm|model|agent|rag|vector|eval/.test(hay)
    ? INFRA
    : /tool|developer|devex|ide|code|engineering|platform/.test(hay)
      ? TOOLING
      : GENERAL;
  return {
    candidates,
    // The real route drops candidates whose feed fails validation; one dropped keeps it realistic.
    stats: { requested: candidates.length + 1, validated: candidates.length },
  };
}
