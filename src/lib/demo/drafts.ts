/**
 * Demo-mode draft fixtures and in-memory store.
 *
 * Backs the /api/drafts/* and /api/inbox/count routes when isDemo() is true,
 * so the inbox renders and every card action (approve, reject, edit,
 * regenerate, personalize, generate) responds with the same shape the real
 * handlers return. Nothing here touches the database or the network.
 *
 * Mutations apply to a process-local store held on globalThis (so it survives
 * Next.js route-bundle isolation and HMR). A server restart resets the demo.
 *
 * Fixture copy deliberately contains no em-dashes: the product's premise is
 * stripping AI tells, so the demo content must not carry them.
 */
import type { SerializedFlag } from "@/lib/ai/scan-draft";
import { addDemoPost } from "@/lib/demo/workspace";

type TemplateId =
  | "scene_first"
  | "counterintuitive"
  | "data_unpack"
  | "mid_thought"
  | "specific_mistake";

type DemoResearchItem = {
  title: string;
  url: string;
  summary: string;
  sourceType: string;
  publishedAt: string | null;
};

/** Mirrors the per-draft object returned by GET /api/drafts. */
export type DemoDraft = {
  id: string;
  draftText: string;
  hook: string;
  format: string;
  voiceScore: number | null;
  aiTellFlags: string | null;
  sourceUrls: string[];
  status: string;
  regenerationCount: number;
  staleAfter: string;
  generatedAt: string;
  editedText: string | null;
  topicLabel: string | null;
  seriesId: string | null;
  seriesPosition: number | null;
  seriesContext: string | null;
  seriesTitle: string | null;
  researchItem: DemoResearchItem | null;
};

type Fixture = {
  slug: string;
  topic: string;
  /** One of the five structure templates in src/lib/ai/structure-templates.ts. */
  template: TemplateId;
  paragraphs: string[];
  /** Built from the final text so details (e.g. char counts) stay truthful. */
  flags?: (text: string) => SerializedFlag[];
  voiceFlags?: string[];
  voiceScore: number;
  research: {
    title: string;
    url: string;
    summary: string;
    sourceType: string;
    daysAgo: number;
  };
  personal: { paragraph: string; component: string; rationale: string };
  minutesAgo: number;
  /** Hours until the draft goes stale. Defaults to 72. */
  staleInHours?: number;
};

const TOPICS = {
  infra: "AI Infrastructure",
  tooling: "Developer Tooling",
  leadership: "Engineering Leadership",
} as const;

function warn(
  ruleId: string,
  category: SerializedFlag["category"],
  message: string,
  details?: string,
): SerializedFlag {
  return {
    ruleId,
    category,
    severity: "warning",
    action: "flag",
    message,
    ...(details ? { details } : {}),
  };
}

const FIXTURES: Fixture[] = [
  // 1. scene_first, clean
  {
    slug: "01",
    topic: TOPICS.infra,
    template: "scene_first",
    minutesAgo: 35,
    voiceScore: 9,
    paragraphs: [
      "2:40 AM. The pager went off for the third time that week, and the dashboard said our inference cluster was running at 31% GPU utilization.",
      "We had 312 A100s and we were paying for every one of them. Meanwhile a batch of requests sat in a queue for 9 seconds because one model server had run out of KV cache memory while its neighbours idled.",
      "The root cause was embarrassingly ordinary. We had pinned each model to a fixed pool of GPUs back when we served four models. We now served nineteen. Nobody revisited the pinning because it never broke loudly, it just wasted money quietly.",
      "Here is what the audit found. Eleven of the nineteen models saw fewer than 50 requests per minute at peak, yet each held a dedicated 8-GPU node. Three had not served a production request in over a month. We had built a very expensive museum of past decisions.",
      "We moved to a shared pool with a scheduler that packs models by memory footprint and sheds low-priority traffic first. Utilization went from 31% to 68% in three weeks, and the monthly GPU bill dropped by about $140k without touching a single model.",
      "The migration was not free. Cold-start latency for rarely used models went from zero to about 12 seconds, so we kept the five busiest models warm and accepted the tradeoff for the long tail.",
      "The lesson I keep relearning is that the expensive problems in infrastructure rarely page you. The loud ones get fixed. The quiet ones compound.",
    ],
    research: {
      title: "Bin-packing models onto shared GPU pools: lessons from production inference",
      url: "https://www.infoq.com/articles/gpu-bin-packing-inference-clusters/",
      summary:
        "Engineers describe moving from per-model GPU pinning to a shared pool with memory-aware scheduling, and the utilization gains that followed.",
      sourceType: "rss",
      daysAgo: 1,
    },
    personal: {
      paragraph:
        "I still remember the first finance review after the change, when the controller asked me twice whether the lower invoice was a typo.",
      component: "Cut GPU spend by $140k/month at a previous employer",
      rationale: "The draft is about reclaiming GPU spend, which matches a stored cost-reduction experience.",
    },
  },

  // 2. counterintuitive, clean, short
  {
    slug: "02",
    topic: TOPICS.leadership,
    template: "counterintuitive",
    minutesAgo: 95,
    voiceScore: 8,
    paragraphs: [
      "Your best on-call engineer is a sign of a fragile system, not a strong team.",
      "On my last team, one engineer resolved roughly 60% of our incidents. We celebrated her for it. Then she took two weeks of leave and our mean time to recover tripled, from 22 minutes to 71.",
      "Resilience would have meant the numbers stayed flat. What we had was a single point of failure with a name and a Slack handle.",
      "We fixed it by having her write runbooks for everything she did by instinct, then rotating a different engineer through the first-responder seat each week. MTTR settled at 29 minutes, and she stopped dreading her phone.",
      "If one person is the answer to every incident, the system has not learned anything yet.",
    ],
    research: {
      title: "Why heroics are a smell: on-call load distribution in mature SRE teams",
      url: "https://sre.google/resources/practices-and-processes/on-call-load-distribution/",
      summary:
        "A review of incident ownership across several teams finds that concentrated knowledge, not incident volume, is the strongest predictor of slow recovery.",
      sourceType: "rss",
      daysAgo: 2,
    },
    personal: {
      paragraph:
        "I learned this the hard way the week I sat in a war room because the only person who knew the failover steps was on a beach.",
      component: "Led an on-call rotation redesign that cut MTTR by a third",
      rationale: "The post is about on-call dependence, which lines up with a stored incident-process experience.",
    },
  },

  // 3. data_unpack, clean
  {
    slug: "03",
    topic: TOPICS.tooling,
    template: "data_unpack",
    minutesAgo: 170,
    voiceScore: 9,
    paragraphs: [
      "Our CI p50 went from 14 minutes 20 seconds to 3 minutes 50 seconds after we turned on a remote build cache.",
      "The headline number is real, but the interesting part is where the savings came from. About 70% of the gain was cache hits on test targets nobody had touched in the diff. Another 20% came from finally making our Docker layers deterministic. Only 10% was faster hardware.",
      "What the number hides is the change in behaviour. Pull requests per engineer per week went from 4.1 to 6.3 over the next quarter. People stopped batching changes to avoid waiting on CI. Smaller PRs got reviewed faster, and review turnaround fell from 19 hours to 8.",
      "If I did it again, I would instrument PR size before touching the build system. We guessed that CI time was the bottleneck. We got lucky that it was.",
    ],
    research: {
      title: "Remote caching in Bazel at scale: what actually moves build times",
      url: "https://thenewstack.io/remote-caching-bazel-build-times/",
      summary:
        "A case study on adopting remote build caching shows most of the speedup coming from avoided test reruns rather than compute upgrades.",
      sourceType: "rss",
      daysAgo: 3,
    },
    personal: {
      paragraph:
        "On my team the proof was the Slack channel. Complaints about slow CI had been a daily ritual for two years, and they simply stopped.",
      component: "Introduced remote build caching and cut CI time by 73%",
      rationale: "The post is a build-time data story, which matches a stored CI performance experience.",
    },
  },

  // 4. data_unpack with a fact-check flag
  {
    slug: "12",
    topic: TOPICS.infra,
    template: "data_unpack",
    minutesAgo: 240,
    voiceScore: 7,
    staleInHours: 9,
    paragraphs: [
      "Speculative decoding cut our p99 latency by 40% on the chat endpoint, and it took one afternoon to turn on.",
      "The idea is simple. A small draft model proposes several tokens at once, and the large model verifies them in a single forward pass. When the draft is right, you get multiple tokens for the price of one step. When it is wrong, you lose almost nothing.",
      "In our traffic the acceptance rate sat around 71%, which was enough to take median time to first token from 410 ms to 320 ms and lift throughput by 1.8x on the same hardware. The technique works with any 7B model out of the box, so we rolled it to all three of our smaller deployments the same week.",
      "The catch is tuning. Our code-generation traffic had an acceptance rate closer to 45%, and at that level the extra verification work ate most of the gain. We now route by task type and only speculate where acceptance stays above 60%.",
      "We also had to change how we load test. Replaying synthetic prompts gave us a 90% acceptance rate, which would have made the whole project look like a miracle. Replaying a week of real logs gave 71%. Synthetic traffic is far too polite.",
      "If you serve open models and have not tried this, run it against a week of real traffic before you decide. The benchmark numbers will not tell you how your prompts behave.",
    ],
    flags: () => [
      warn(
        "fact_check_unsupported_claims",
        "structural",
        "Possible unsupported claims found",
        "Claim: 'cut our p99 latency by 40%'. Source says: The article reports a 22% reduction in median latency and does not report p99 figures. | Claim: 'works with any 7B model out of the box'. Source says: The source tested two model families and notes that draft-model alignment strongly affects the speedup.",
      ),
    ],
    research: {
      title: "Speculative decoding in production: acceptance rates, throughput and caveats",
      url: "https://huggingface.co/blog/speculative-decoding-in-production",
      summary:
        "Benchmarks on two model families show a 22% median latency reduction and up to 1.8x throughput, with gains dependent on draft-model alignment.",
      sourceType: "tavily_news",
      daysAgo: 1,
    },
    personal: {
      paragraph:
        "The first time I saw the throughput graph move I assumed the dashboard was broken. I reloaded it three times before I believed it.",
      component: "Tuned LLM serving throughput on a self-hosted inference stack",
      rationale: "The post covers inference serving optimisation, which matches a stored serving experience.",
    },
  },

  // 5. mid_thought, clean
  {
    slug: "04",
    topic: TOPICS.infra,
    template: "mid_thought",
    minutesAgo: 330,
    voiceScore: 7,
    paragraphs: [
      "The part about pgvector that nobody puts in the benchmarks is what happens around the 30 million row mark. Recall is fine. Query latency is fine on a warm cache. What breaks is the index build, which took our 16 vCPU Postgres instance almost 11 hours and blocked every migration queued behind it.",
      "Recall tuning was the other surprise. Moving HNSW ef_search from 40 to 200 lifted recall@10 from 0.91 to 0.97 on our eval set, but p95 query latency went from 38 ms to 140 ms. Neither number is wrong. They are two ends of a dial, and most teams never turn it on purpose.",
      "On a previous project we had picked a dedicated vector database for exactly this reason, and it carried its own tax: a second consistency model, a second backup story, and a sync job that drifted by a few thousand documents every week. Debugging that drift cost us more engineer-hours than the Postgres index build ever did.",
      "We ended up with a per-endpoint setting: 40 for autocomplete, 200 for the research assistant, where a missed document costs the user real time.",
      "So the honest comparison is not pgvector against a purpose-built engine on query speed. It is one operational surface against two. Under roughly 10 million vectors I would stay in Postgres and sleep fine. Past 50 million, I would take the second system and budget a person to babysit the sync.",
      "Somewhere in between is a grey zone where the right answer depends on how much your team enjoys being paged.",
    ],
    research: {
      title: "Benchmarking pgvector HNSW at 50M vectors: build times and recall",
      url: "https://www.timescale.com/blog/pgvector-hnsw-large-scale-benchmarks",
      summary:
        "Index build time and memory pressure, rather than query latency, emerge as the main constraints when scaling pgvector past tens of millions of rows.",
      sourceType: "rss",
      daysAgo: 4,
    },
    personal: {
      paragraph:
        "I have been on the receiving end of both choices, and the sync job was the one that cost me weekends.",
      component: "Migrated a retrieval system between vector stores and ran both in parallel",
      rationale: "The post compares vector store operations, which matches a stored migration experience.",
    },
  },

  // 6. specific_mistake, clean
  {
    slug: "05",
    topic: TOPICS.leadership,
    template: "specific_mistake",
    minutesAgo: 480,
    voiceScore: 8,
    paragraphs: [
      "I promoted the wrong person to staff engineer in 2022, and I knew within a month.",
      "She was the strongest debugger I had ever worked with. Give her a flaky distributed system at 11 PM and she would find the race condition by midnight. So when the staff role opened, hers was the only name on my list.",
      "What I missed is that staff scope is mostly about getting other people unstuck, writing the doc that aligns three teams, and saying no to good ideas. She hated all of it, and she was right to. Six months in, our platform team had shipped almost nothing and she was quietly updating her resume.",
      "In hindsight the warning signs were there. In our quarterly calibration she scored top marks on every technical axis and merely met expectations on every influence axis, and I read that as a gap to coach instead of a preference to respect. We ran two coaching cycles. Both were wasted effort on what was really a role mismatch.",
      "We fixed it by creating a principal IC track built around deep technical problems, with no expectation of cross-team influence. She took it, and over the next two quarters she cut our p99 checkout latency from 2.4 seconds to 900 ms.",
      "Two other engineers on the team had noticed the same pattern and asked me quietly whether they had to want staff to be taken seriously. That question changed how I write job ladders.",
      "The mistake was treating promotion as a reward for the skill I valued most, instead of asking what the next job actually required.",
    ],
    research: {
      title: "Staff engineer archetypes and why the title means different things",
      url: "https://staffeng.com/guides/staff-archetypes",
      summary:
        "An overview of the four common staff-plus archetypes and the mismatch that occurs when strong specialists are promoted into broad-influence roles.",
      sourceType: "rss",
      daysAgo: 6,
    },
    personal: {
      paragraph:
        "The conversation where she told me she did not want the job was one of the more uncomfortable ones of my career, and one of the most useful.",
      component: "Designed a dual-track IC ladder for a 60-person engineering org",
      rationale: "The post is about promotion paths for senior ICs, which matches a stored career ladder experience.",
    },
  },

  // 7. scene_first, clean
  {
    slug: "06",
    topic: TOPICS.tooling,
    template: "scene_first",
    minutesAgo: 610,
    voiceScore: 9,
    paragraphs: [
      "Last Thursday a pull request sat for four days because the only reviewer who understood the billing module was on a flight to Singapore.",
      "The diff was 38 lines. It changed how we round proration for annual plans. Nobody else on the team wanted to approve it, which is a reasonable instinct, because rounding bugs in billing do not announce themselves. They show up in a finance audit eight months later.",
      "We have run an LLM review bot on every PR since March. It handles the boring stuff well: missing null checks, unused imports, a retry loop with no backoff. Across 212 reviews it has been wrong about 14 times, mostly on domain rules it could not know.",
      "Since then we have tracked review latency by module. The median across the repo is 5 hours. For billing it was 41 hours and for the auth service 29. Those two modules hold 3% of our code and 22% of our stalled PRs.",
      "We responded with pairing. Every change to those modules now has a named primary and a named backup reviewer, and the backup rotates each sprint so knowledge spreads without a training program. After two months billing review time fell to 14 hours.",
      "That PR is the case it cannot solve. The bot flagged the rounding change and asked a good question, but a human with context still had to answer it. What I took from it is that tooling should shrink the set of things only one person knows, and billing logic needs a second expert far more than it needs a smarter bot.",
    ],
    research: {
      title: "What AI code review catches, and what it still misses",
      url: "https://github.blog/engineering/ai-code-review-what-it-catches-and-misses/",
      summary:
        "An analysis of automated review comments finds high precision on mechanical issues and low usefulness on domain-specific logic.",
      sourceType: "tavily_news",
      daysAgo: 2,
    },
    personal: {
      paragraph:
        "We now keep a short list of modules that need two named reviewers, and billing was the first one on it.",
      component: "Rolled out an LLM code review bot to a 40-engineer team",
      rationale: "The post is about AI review tooling, which matches a stored rollout experience.",
    },
  },

  // 8. warning: uniform sentence rhythm, plus a voice flag
  {
    slug: "09",
    topic: TOPICS.leadership,
    template: "mid_thought",
    minutesAgo: 760,
    voiceScore: 6,
    voiceFlags: ["Sentences run shorter and more uniform than your calibration samples."],
    paragraphs: [
      "One on ones are the cheapest management tool we have. Most teams waste them on status updates. I stopped asking about status two years ago. Now I ask what is making the work harder than it needs to be.",
      "The answers are usually small. A flaky test suite. A dashboard nobody trusts. A review queue that stalls on Fridays. I keep a running list of these in a shared doc. Every quarter I pick the five with the most mentions.",
      "We fixed 23 of these items last year. Attrition on my team dropped from 18% to 6%. I do not think that is a coincidence. People tend to stay where their daily friction gets removed.",
      "The pattern holds up in the exit interviews I have read. Almost nobody leaves over one big thing. They leave over the hundredth small thing that nobody fixed.",
    ],
    flags: () => [
      warn(
        "struct_sentence_cv",
        "structural",
        "Sentence-length coefficient of variation <0.4 (uniform AI rhythm)",
        "Sentence-length CV 0.31 (target ≥0.4)",
      ),
    ],
    research: {
      title: "Developer friction logs: the cheapest retention lever engineering managers ignore",
      url: "https://blog.pragmaticengineer.com/developer-friction-and-retention/",
      summary:
        "Teams that systematically track and remove small daily frictions report lower attrition than teams that focus on compensation alone.",
      sourceType: "rss",
      daysAgo: 5,
    },
    personal: {
      paragraph:
        "My own list started on a sticky note after a skip-level where an engineer told me the staging environment had been broken for six weeks.",
      component: "Ran a friction-log program that removed 23 recurring blockers",
      rationale: "The post is about collecting and fixing small engineering frictions, which matches a stored program.",
    },
  },

  // 9. data_unpack, clean
  {
    slug: "07",
    topic: TOPICS.infra,
    template: "data_unpack",
    minutesAgo: 900,
    voiceScore: 8,
    paragraphs: [
      "Moving our 70B model from FP16 to INT8 cut serving cost per million tokens from $0.84 to $0.47. That is the number in the slide deck. Here is the part that is not.",
      "We ran our eval suite of 1,800 prompts before and after. Aggregate accuracy moved by 0.4 points, well inside the noise. But one slice, 61 prompts involving multi-step arithmetic over tables, dropped from 83% to 71%. Nobody would have seen it in an average.",
      "Quantization error does not spread evenly. It concentrates on tasks that depend on small differences between logits, and those are often the tasks your highest-value customers care about.",
      "So we shipped INT8 for 90% of traffic and kept an FP16 route for requests tagged as numerical reasoning. Blended cost landed at $0.52 per million tokens, and the support queue stayed quiet.",
      "Rollout was boring in the best way. We moved traffic 5%, then 25%, then 100% over nine days and watched three dashboards: task-level accuracy, p95 latency, and a daily sample of 50 outputs that a human read end to end.",
      "Hardware mattered too. On H100s the INT8 path avoids most dequantization overhead, while on our older A10 nodes the savings were closer to 20%.",
      "My rule now is to never accept an aggregate eval for a compression change. Slice it by task type first, then decide.",
    ],
    research: {
      title: "INT8 and FP8 quantization for LLM serving: accuracy across task slices",
      url: "https://developer.nvidia.com/blog/int8-fp8-llm-serving-accuracy-slices/",
      summary:
        "Evaluation across task categories shows that average accuracy hides regressions in numerical and long-context tasks after post-training quantization.",
      sourceType: "tavily_news",
      daysAgo: 2,
    },
    personal: {
      paragraph:
        "We found our slice by accident, when one customer's finance team filed a ticket that said the totals looked off by a few cents.",
      component: "Shipped quantized models behind a task-aware routing layer",
      rationale: "The post is about quantization tradeoffs, which matches a stored model-serving experience.",
    },
  },

  // 10. warning: generic vocabulary, plus an info-level auto-clean note
  {
    slug: "10",
    topic: TOPICS.infra,
    template: "data_unpack",
    minutesAgo: 1080,
    voiceScore: 7,
    paragraphs: [
      "We gate every model deploy on a golden set of 400 prompts, and in the last two quarters it has blocked 11 releases that would have reached customers.",
      "The set is small on purpose. Each prompt has a reference answer, a rubric, and an owner who wrote it after a real incident. When a deploy fails the gate, the owner gets pinged with a side-by-side diff, not a score. That one choice cut our triage time from about two days to under an hour.",
      "We leverage a cheaper judge model for the first pass and escalate only the disagreements to a stronger one. That keeps the per-deploy eval cost at roughly $9 instead of the $60 we paid when every prompt went to the big model.",
      "The harness itself is not clever. What makes it robust is that every failure becomes a new prompt, so the set grows from production pain instead of from what we imagine might go wrong.",
      "If you are building evals for the first time, start with ten prompts from real incidents. You will learn more from those than from a thousand synthetic ones.",
    ],
    flags: () => [
      warn(
        "lex_word_choices",
        "lexical",
        "Prefer simpler synonyms over generic AI vocabulary",
        "leverage, robust",
      ),
      {
        ruleId: "struct_markdown_leak",
        category: "structural",
        severity: "info",
        action: "auto_strip",
        message: "Markdown formatting stripped",
        details: "Removed 4 bold markers",
      },
    ],
    research: {
      title: "Building a golden-set eval gate for LLM deployments",
      url: "https://www.latent.space/p/golden-set-eval-gate",
      summary:
        "A practical guide to small, incident-derived eval sets, LLM-as-judge cost control, and blocking releases on regression.",
      sourceType: "rss",
      daysAgo: 3,
    },
    personal: {
      paragraph:
        "The first prompt in our set came from a bad Monday, when a model update started answering in the wrong language for one customer.",
      component: "Built an eval gate that blocks regressions before model deploys",
      rationale: "The post covers deploy-time evals, which matches a stored eval infrastructure experience.",
    },
  },

  // 11. counterintuitive, clean
  {
    slug: "08",
    topic: TOPICS.tooling,
    template: "counterintuitive",
    minutesAgo: 1260,
    voiceScore: 8,
    paragraphs: [
      "A monorepo does not make your dependency graph healthier. It makes it visible, which is a different thing, and the first month of looking at it is unpleasant.",
      "When we merged 41 repositories into one last year, the graph showed 1,100 cross-package imports that nobody had approved. Seven of them formed cycles. One shared utils package was imported by every service and changed 30 times a week.",
      "We spent the next quarter on boring work: code owners per directory, a lint rule that blocked new imports of the utils package, and a weekly 30-minute review of the ten most depended-on files. The cycles are gone and the utils package is a third of its old size.",
      "If you are considering a monorepo to escape dependency pain, budget for the quarter of cleanup that follows. The tooling is the easy part.",
    ],
    research: {
      title: "Monorepo migration retrospective: 41 repos, one graph",
      url: "https://engineering.atspotify.com/2024/monorepo-migration-retrospective",
      summary:
        "A retrospective on consolidating dozens of repositories, focusing on dependency visibility, ownership rules and the cleanup work that followed.",
      sourceType: "rss",
      daysAgo: 5,
    },
    personal: {
      paragraph:
        "I drew the first version of that dependency graph on a whiteboard, and the room went quiet when we got to the cycles.",
      component: "Led a 41-repo to monorepo consolidation",
      rationale: "The post is about monorepo migration, which matches a stored consolidation project.",
    },
  },

  // 12. warning: AI-tell phrases and a short post
  {
    slug: "11",
    topic: TOPICS.tooling,
    template: "counterintuitive",
    minutesAgo: 1400,
    voiceScore: 5,
    paragraphs: [
      "Stop writing design docs for decisions you can reverse in a day.",
      "We tracked 60 design docs over six months. Thirty-four covered changes we could have rolled back in under a day, and those took an average of nine days to approve. The real unlock was a simple rule: if it is cheap to undo, ship it behind a flag and write the doc afterwards.",
      "Here is how we run it now. Any change tagged reversible skips the doc and needs one reviewer. Anything touching data migrations, public APIs, or billing still gets the full treatment, because those are the doors that do not swing back.",
      "Review time on the remaining 26 docs dropped by half, because reviewers finally had room to read them properly. At the end of the day, process should scale with the cost of being wrong.",
    ],
    flags: (text) => [
      warn(
        "phrase_ai_tells",
        "phrase",
        "Generic AI-tell phrases (truth bomb, the magic happens when, etc.)",
        "the real unlock; at the end of the day",
      ),
      warn(
        "struct_char_count",
        "structural",
        "Target character count 1200–2800 (advisory)",
        `${text.length} chars (target 1200–2800)`,
      ),
    ],
    research: {
      title: "One-way and two-way doors: matching process to reversibility",
      url: "https://martinfowler.com/articles/reversible-decisions.html",
      summary:
        "Argues that engineering process overhead should be proportional to how costly a decision is to reverse, with examples from design review.",
      sourceType: "rss",
      daysAgo: 7,
    },
    personal: {
      paragraph:
        "The doc that convinced me was a four-page proposal to rename a config key. It took eleven days to approve and the rename took twenty minutes.",
      component: "Introduced a reversibility rule for design review at a Series B startup",
      rationale: "The post is about proportional design review, which matches a stored process change.",
    },
  },
];

type Store = {
  drafts: DemoDraft[];
  counter: number;
  quickUsed: number;
  cursor: number;
};

const STORE_KEY = "__voce_demo_drafts_store__";
const QUICK_LIMIT = 3;

function buildDraft(f: Fixture, now: number, id?: string): DemoDraft {
  const text = f.paragraphs.join("\n\n");
  const flags = f.flags ? f.flags(text) : [];
  const hasVoice = (f.voiceFlags?.length ?? 0) > 0;
  // Same persistence rule as serializeAiTellFlags / buildAiTellFlagsJson:
  // zero flags is stored as null, never as an empty payload.
  const aiTellFlags =
    flags.length === 0 && !hasVoice
      ? null
      : JSON.stringify({ flags, ...(hasVoice ? { voice: f.voiceFlags } : {}) });
  return {
    id: id ?? `demo-draft-${f.slug}`,
    draftText: text,
    hook: f.paragraphs[0] ?? "",
    format: "text_post",
    voiceScore: f.voiceScore,
    aiTellFlags,
    sourceUrls: [f.research.url],
    status: "pending",
    regenerationCount: 0,
    staleAfter: new Date(now + (f.staleInHours ?? 72) * 3_600_000).toISOString(),
    generatedAt: new Date(now - f.minutesAgo * 60_000).toISOString(),
    editedText: null,
    topicLabel: f.topic,
    seriesId: null,
    seriesPosition: null,
    seriesContext: null,
    seriesTitle: null,
    researchItem: {
      title: f.research.title,
      url: f.research.url,
      summary: f.research.summary,
      sourceType: f.research.sourceType,
      publishedAt: new Date(now - f.research.daysAgo * 86_400_000).toISOString(),
    },
  };
}

function getStore(): Store {
  const g = globalThis as unknown as Record<string, Store | undefined>;
  let store = g[STORE_KEY];
  if (!store) {
    const now = Date.now();
    store = {
      drafts: FIXTURES.map((f) => buildDraft(f, now)).sort(
        (a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt),
      ),
      counter: 0,
      quickUsed: 0,
      cursor: 0,
    };
    g[STORE_KEY] = store;
  }
  return store;
}

function fixtureFor(draft: DemoDraft): Fixture | undefined {
  const slug = draft.id.match(/^demo-draft-(\d+)/)?.[1];
  const bySlug = slug ? FIXTURES.find((f) => f.slug === slug) : undefined;
  return bySlug ?? FIXTURES.find((f) => f.research.url === draft.sourceUrls[0]);
}

function pendingDrafts(store: Store): DemoDraft[] {
  return store.drafts.filter((d) => d.status === "pending");
}

function newId(store: Store, base: string): string {
  store.counter += 1;
  return `${base}-g${store.counter}`;
}

/** Clone a fixture as a freshly generated draft and put it at the top of the inbox. */
function spawnFromFixture(store: Store, f: Fixture): DemoDraft {
  const draft = buildDraft(
    { ...f, minutesAgo: 0, staleInHours: 72 },
    Date.now(),
    newId(store, `demo-draft-${f.slug}`),
  );
  store.drafts.unshift(draft);
  return draft;
}

function pickNextFixture(store: Store, topic?: string): Fixture {
  const shown = new Set(pendingDrafts(store).map((d) => fixtureFor(d)?.slug));
  const unseen = FIXTURES.filter((f) => !shown.has(f.slug));
  const pool = unseen.length > 0 ? unseen : FIXTURES;

  if (topic) {
    const words = topic
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3);
    let best: Fixture | null = null;
    let bestScore = 0;
    for (const f of pool) {
      const hay = `${f.topic} ${f.research.title} ${f.paragraphs.join(" ")}`.toLowerCase();
      const score = words.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0);
      if (score > bestScore) {
        best = f;
        bestScore = score;
      }
    }
    if (best) return best;
  }
  const chosen = pool[store.cursor % pool.length]!;
  store.cursor += 1;
  return chosen;
}

/** Next weekday at about 09:00 UTC, standing in for calculateScheduledAt. */
function nextSlot(from = new Date()): Date {
  const slot = new Date(from);
  slot.setUTCDate(slot.getUTCDate() + 1);
  slot.setUTCHours(9, 7, 0, 0);
  while (slot.getUTCDay() === 0 || slot.getUTCDay() === 6) {
    slot.setUTCDate(slot.getUTCDate() + 1);
  }
  return slot;
}

/** Cheap stand-in for a rewrite: honour "shorter" style instructions, else keep the text. */
function applyInstruction(text: string, instruction: string): string {
  if (!/short|concise|trim|tighten|cut|brief/i.test(instruction)) return text;
  const paras = text.split("\n\n");
  if (paras.length < 4) return text;
  const target = text.length * 0.65;
  const first = paras[0]!;
  const last = paras[paras.length - 1]!;
  const middle = paras.slice(1, -1);
  while (middle.length > 1 && [first, ...middle, last].join("\n\n").length > target) {
    middle.pop();
  }
  return [first, ...middle, last].join("\n\n");
}

export const demoDrafts = {
  /** Body for GET /api/drafts. Same shape as the real handler. */
  list(status = "pending", limit = 20) {
    const store = getStore();
    const cap = Number.isFinite(limit) && limit > 0 ? limit : 20;
    const rows = store.drafts
      .filter((d) => d.status === status)
      .sort((a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt))
      .slice(0, cap);
    return {
      drafts: rows,
      quickGenerateRemaining:
        process.env.DEMO_ENFORCE_QUICK_LIMIT === "true"
          ? Math.max(0, QUICK_LIMIT - store.quickUsed)
          : QUICK_LIMIT,
      lastCronStatus: "success" as string | null,
      lastCronAt: new Date(Date.now() - 6 * 3_600_000).toISOString() as string | null,
    };
  },

  /** Body for GET /api/inbox/count. */
  count() {
    return { pendingCount: pendingDrafts(getStore()).length };
  },

  /** Body for POST /api/drafts/[id]/approve. */
  approve(id: string, scheduledAt?: string | null) {
    const draft = getStore().drafts.find((d) => d.id === id);
    if (draft) draft.status = "approved";
    const parsed = scheduledAt ? new Date(scheduledAt) : null;
    const when = parsed && !Number.isNaN(parsed.getTime()) ? parsed : nextSlot();

    // Push the approved draft into the shared post store so it appears on
    // /history as a scheduled post. Without this the demo narrative breaks:
    // you approve a draft and it vanishes instead of showing up downstream.
    const post = addDemoPost({
      contentSnapshot: draft?.editedText ?? draft?.draftText ?? "",
      scheduledAt: when.toISOString(),
      status: "scheduled",
      draftId: id,
      voiceScore: draft?.voiceScore ?? null,
    });

    return { scheduledAt: when.toISOString(), postId: post.id };
  },

  /** Body for POST /api/drafts/[id]/reject. */
  reject(id: string) {
    const draft = getStore().drafts.find((d) => d.id === id);
    if (draft) draft.status = "rejected";
    return { success: true };
  },

  /** Body for PUT /api/drafts/[id]/edit. */
  edit(id: string, editedText: string) {
    const draft = getStore().drafts.find((d) => d.id === id);
    if (draft) draft.editedText = editedText;
    return { success: true };
  },

  /** Body for POST /api/drafts/[id]/regenerate: `{ draft }`, like the real insert().returning(). */
  regenerate(id: string, instruction: string) {
    const store = getStore();
    const original = store.drafts.find((d) => d.id === id);
    const now = Date.now();
    const seed = original ?? buildDraft(FIXTURES[0]!, now);
    const baseText = seed.editedText?.trim() ? seed.editedText : seed.draftText;
    const text = applyInstruction(baseText, instruction);
    const created: DemoDraft = {
      ...seed,
      id: newId(store, seed.id.replace(/-g\d+$/, "")),
      draftText: text,
      hook: text.split("\n")[0] ?? "",
      editedText: null,
      aiTellFlags: null,
      voiceScore: Math.min(10, (seed.voiceScore ?? 7) + 1),
      status: "pending",
      regenerationCount: seed.regenerationCount + 1,
      generatedAt: new Date(now).toISOString(),
    };
    if (original) original.status = "rejected";
    store.drafts.unshift(created);
    return { draft: created };
  },

  /** Body for POST /api/drafts/[id]/personalize, or null when the draft is unknown. */
  personalize(id: string) {
    const draft = getStore().drafts.find((d) => d.id === id);
    if (!draft) return null;
    const fixture = fixtureFor(draft) ?? FIXTURES[0]!;
    const base = draft.editedText?.trim() ? draft.editedText : draft.draftText;
    if (base.includes(fixture.personal.paragraph)) {
      draft.draftText = base;
    } else {
      const paras = base.split("\n\n");
      paras.splice(1, 0, fixture.personal.paragraph);
      draft.draftText = paras.join("\n\n");
    }
    draft.hook = draft.draftText.split("\n")[0] ?? draft.hook;
    draft.editedText = null;
    draft.aiTellFlags = null;
    draft.voiceScore = Math.min(10, Math.max(draft.voiceScore ?? 7, 8));
    return {
      ...draft,
      personalization: {
        mode: "targeted" as const,
        componentUsed: fixture.personal.component,
        rationale: fixture.personal.rationale,
      },
    };
  },

  /** Body for POST /api/drafts/generate-one. */
  generateOne() {
    const store = getStore();
    const draft = spawnFromFixture(store, pickNextFixture(store));
    return { draftId: draft.id };
  },

  /** Body for POST /api/drafts/generate-quick. Null once the daily limit is spent (route returns 429). */
  generateQuick(topic: string) {
    const store = getStore();
    // The cap is cosmetic in demo mode. A real account is limited to 3 a day,
    // and we keep the counter on screen because it is a real product rule, but
    // never block: burning the quota in rehearsal would kill the centrepiece of
    // the demo mid-presentation. Set DEMO_ENFORCE_QUICK_LIMIT=true to restore it.
    if (process.env.DEMO_ENFORCE_QUICK_LIMIT === "true" && store.quickUsed >= QUICK_LIMIT) {
      return null;
    }
    const draft = spawnFromFixture(store, pickNextFixture(store, topic));
    store.quickUsed += 1;
    const remainingToday =
      process.env.DEMO_ENFORCE_QUICK_LIMIT === "true"
        ? Math.max(0, QUICK_LIMIT - store.quickUsed)
        : QUICK_LIMIT;
    return { draftId: draft.id, remainingToday };
  },
};
