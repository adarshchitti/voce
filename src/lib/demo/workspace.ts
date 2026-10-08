/**
 * Demo-mode workspace fixtures: settings, voice, topics, projects, posts, insights.
 *
 * A hand-authored, lived-in account for a senior engineer who writes about AI
 * infrastructure and developer tooling. Served by the /api/settings, /api/voice,
 * /api/topics, /api/projects, /api/posts routes and the insights page when
 * isDemo() is true. Nothing here touches the database or the network.
 *
 * The store is mutable and lives on globalThis, so edits made while clicking
 * through the demo (banned-word chips, topic weights, project settings, ...)
 * survive the follow-up GET and Next.js dev-server module reloads. Restart the
 * server to reset it.
 *
 * Response shapes mirror the real route handlers exactly. See UI_OVERHAUL_PLAN.md §6.
 */
import type { rejectionReasons } from "@/lib/db/schema";
import { DEMO_USER_ID } from "@/lib/demo/mode";
import { FIELD_LIMITS, sanitiseBannedWords, sanitiseShortText } from "@/lib/sanitise";

// ---------------------------------------------------------------------------
// Time + id helpers
// ---------------------------------------------------------------------------

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function isoFromNow(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function daysFromNow(days: number): string {
  return isoFromNow(days * DAY);
}

function fixtureId(group: number, n: number): string {
  return `${group}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function newId(): string {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DemoTopic = {
  id: string;
  userId: string;
  topicLabel: string;
  tavilyQuery: string;
  priorityWeight: number;
  tavilyQuerySuggested: string | null;
  tavilyQueryConfirmed: boolean;
  sourceUrls: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
  lastResearchFetchAt: string | null;
  lastResearchFetchStatus: string | null;
};

type DemoProject = {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  arcType: string | null;
  targetPosts: number | null;
  status: string;
  hashtags: string[];
  createdAt: string;
  updatedAt: string;
  goal: string | null;
  targetAudience: string | null;
  startDate: string | null;
  endDate: string | null;
  postTypePreferences: string[];
  projectSourceUrls: string[];
  projectTopics: string[];
  autoGenerate: boolean;
  links: Array<{ topicSubscriptionId: string; priorityWeight: number }>;
};

export type DemoPost = {
  id: string;
  status: string;
  contentSnapshot: string;
  scheduledAt: string;
  publishedAt: string | null;
  failureReason: string | null;
  linkedinPostId: string | null;
  manualImpressions: number | null;
  manualReactions: number | null;
  manualComments: number | null;
  seriesId: string | null;
  seriesPosition: number | null;
  draftId: string;
  voiceScore: number | null;
  seriesTitle: string | null;
};

type Store = {
  settings: Record<string, unknown>;
  linkedinToken: Record<string, unknown>;
  voice: Record<string, unknown>;
  topics: DemoTopic[];
  projects: DemoProject[];
  posts: DemoPost[];
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SAMPLE_POSTS = [
  "We cut p99 latency on our inference gateway from 2.4s to 610ms last quarter.\n\nNo new hardware. No model change.\n\nThe fix was embarrassingly boring: we stopped batching requests by arrival time and started batching by prompt length. Short prompts were queueing behind long ones.\n\nProfile the queue before you profile the model.",
  "Hot take from three years of running LLM workloads in production: your retry policy is a bigger reliability lever than your model choice.\n\nWe had a 4% error rate that looked like model flakiness. It was our own retries stampeding a rate limit.\n\nExponential backoff with jitter dropped it to 0.3%. One afternoon of work.",
  "I reviewed 40 pull requests this month. The ones that merged fastest had one thing in common.\n\nThe description answered 'what breaks if this is wrong?' before the reviewer had to ask.\n\nIt costs the author two minutes and saves the reviewer twenty. Write that line.",
  "Our agent evals passed at 94% for six weeks. Production success rate was 71%.\n\nThe eval set was written by the same people who wrote the prompts. Of course it passed.\n\nWe rebuilt it from real failed traces. Pass rate fell to 68%, and now it actually predicts what users see.",
  "Here's the part nobody mentions about moving to a managed vector database: the migration is easy, the query-shape drift is not.\n\nWe re-ranked 10k historical queries on both systems. 18% returned a different top result.\n\nBudget a week for that diff before you cut over.",
  "A junior engineer asked me why we still run a nightly job that replays yesterday's traffic against staging.\n\nBecause last March it caught a tokenizer change that would have silently truncated 3% of prompts.\n\nBoring infrastructure earns its keep exactly once a year. That is enough.",
  "I used to think observability meant more dashboards. Then I spent a week debugging a GPU memory leak with nothing but a flame graph and a hunch.\n\nOne good trace beats forty panels. Instrument the request path first, the infrastructure second.",
  "We deleted 6,000 lines of orchestration code last week and shipped a 200-line state machine in its place.\n\nThe framework gave us flexibility we never used and failure modes we could not see.\n\nIn production, I will take explicit over clever every time.",
];

const PERSONAL_CONTEXT_COMPONENTS = [
  "Led the migration of a 40-service inference platform from a single GPU cluster to a multi-region setup, cutting p99 latency by 75%",
  "Shipped three production RAG systems over the last two years, one of which serves around 2 million queries a month",
  "Spent four years on developer tooling at a large cloud provider before moving into AI infrastructure",
  "Mentors a team of six engineers and runs the weekly architecture review for the platform group",
  "Has been on call for LLM-backed services since 2023 and keeps a running log of every incident postmortem",
];

function buildVoice(): Record<string, unknown> {
  const personalContext =
    "Staff engineer on a platform team that runs LLM inference for internal and customer-facing products. " +
    "Previously four years in developer tooling at a large cloud provider. I have migrated a 40-service inference platform across regions, " +
    "shipped three production RAG systems (one at roughly 2M queries a month), mentor six engineers, and have been on call for LLM-backed services since 2023. " +
    "I write from incident reviews and benchmarks, not from press releases.";

  return {
    id: fixtureId(1, 1),
    userId: DEMO_USER_ID,
    rawDescription:
      "Direct, a little dry, numbers first. Short paragraphs. I write like I talk in a design review: state the problem, show the measurement, say what I would do differently. No hype, no inspirational closers.",
    samplePosts: SAMPLE_POSTS,
    sentenceLength: "short",
    hookStyle: "data_point",
    pov: "first_person_singular",
    toneMarkers: ["direct", "dry", "data-driven", "practical"],
    topicsObserved: [
      "LLM inference",
      "production reliability",
      "developer tooling",
      "AI agents",
      "observability",
      "code review",
    ],
    formattingStyle: "no_emoji",
    userBannedWords: [
      "delve",
      "leverage",
      "game-changer",
      "unlock",
      "synergy",
      "revolutionize",
      "thrilled",
      "in today's fast-paced world",
    ],
    userNotes:
      "I never use bullet lists. Numbers go in the first two lines. I do not end with a question or a call to action.",
    personalContext,
    personalContextComponents: PERSONAL_CONTEXT_COMPONENTS,
    extractedPatterns: { emojiFrequency: "rare" },
    calibrated: true,
    avgSentenceLengthWords: 11,
    sentenceLengthRange: "4-22",
    avgWordsPerPost: 118,
    passiveVoiceRate: "~4% of sentences",
    nominalizationRate: "low",
    hedgingPhrases: ["I think", "in my experience", "usually"],
    rhetoricalQuestionsRate: "0.06",
    personalAnecdoteRate: "0.62",
    dataCitationRate: "0.81",
    paragraphStyle: "two_three_lines",
    hookExamples: [
      "We cut p99 latency on our inference gateway from 2.4s to 610ms last quarter.",
      "Our agent evals passed at 94% for six weeks. Production success rate was 71%.",
      "I reviewed 40 pull requests this month.",
      "We deleted 6,000 lines of orchestration code last week.",
      "A junior engineer asked me why we still run a nightly job that replays traffic.",
    ],
    neverPatterns: [
      "never ends with a call to action",
      "never opens with a rhetorical question",
      "never uses bullet lists or numbered lists",
      "never uses hashtags in the post body",
      "never uses hype words like game-changer or revolutionary",
    ],
    postStructureTemplate:
      "Opens with one concrete number or outcome. Two or three short paragraphs of what was measured and what actually broke. Closes with a single plain takeaway sentence, no question, no CTA.",
    signaturePhrases: [
      "here's the part nobody mentions",
      "in production",
      "the boring answer",
      "what actually broke",
      "profile it first",
    ],
    generationGuidance:
      "Write as a staff engineer reporting from the trenches of production AI infrastructure. Lead with a specific measurement or outcome in the first line, ideally with a before-and-after number. " +
      "Keep sentences short (around 11 words) and paragraphs to one to three lines. Prefer first-person singular and concrete incidents over general advice. " +
      "Explain what actually broke before explaining the fix, and favour the unglamorous cause over the clever one. " +
      "Dry humour is fine, hype is not. Never use bullet or numbered lists, never open with a rhetorical question, and never close with a call to action or an engagement prompt. " +
      "End on one plain takeaway sentence. Avoid emoji entirely and keep hashtags out of the body.",
    samplePostCount: SAMPLE_POSTS.length,
    calibrationQuality: "full",
    emojiContexts: [],
    emojiExamples: [],
    emojiNeverOverride: true,
    updatedAt: daysFromNow(-6),
  };
}

function buildTopics(): DemoTopic[] {
  const base = (
    n: number,
    topicLabel: string,
    tavilyQuery: string,
    priorityWeight: number,
    sourceUrls: string[],
    status: string,
    fetchedHoursAgo: number,
    createdDaysAgo: number,
  ): DemoTopic => ({
    id: fixtureId(2, n),
    userId: DEMO_USER_ID,
    topicLabel,
    tavilyQuery,
    priorityWeight,
    tavilyQuerySuggested: tavilyQuery,
    tavilyQueryConfirmed: true,
    sourceUrls,
    active: true,
    createdAt: daysFromNow(-createdDaysAgo),
    updatedAt: daysFromNow(-Math.max(1, createdDaysAgo - 9)),
    lastResearchFetchAt: isoFromNow(-fetchedHoursAgo * HOUR),
    lastResearchFetchStatus: status,
  });

  return [
    base(
      1,
      "LLM inference infrastructure",
      "LLM inference serving latency throughput batching vLLM TensorRT-LLM GPU cost optimization",
      5,
      ["https://blog.vllm.ai", "https://huggingface.co/blog", "https://www.latent.space"],
      "success",
      4,
      41,
    ),
    base(
      2,
      "AI agents in production",
      "production AI agents reliability evaluation tool calling failure modes observability",
      4,
      ["https://www.anthropic.com/engineering", "https://simonwillison.net"],
      "success",
      4,
      41,
    ),
    base(
      3,
      "Developer tooling and DX",
      "developer experience tooling AI coding assistants code review CI build times",
      4,
      ["https://github.blog", "https://blog.jetbrains.com"],
      "success",
      4,
      38,
    ),
    base(
      4,
      "Platform engineering and observability",
      "platform engineering observability OpenTelemetry tracing SLO incident postmortem",
      3,
      ["https://opentelemetry.io/blog", "https://sre.google/resources"],
      "no_results",
      4,
      30,
    ),
    base(
      5,
      "Open-source model releases",
      "open-weight LLM release benchmark Llama Mistral Qwen deployment cost comparison",
      2,
      ["https://huggingface.co/blog"],
      "success",
      4,
      22,
    ),
  ];
}

type PostSeed = {
  daysAgo: number; // negative => scheduled in the future
  status: "published" | "scheduled" | "failed";
  text: string;
  voiceScore: number;
  series: 0 | 1 | 2; // 0 = no project
  position?: number;
  metrics?: [number, number, number]; // impressions, reactions, comments
  failureReason?: string;
};

const POST_SEEDS: PostSeed[] = [
  {
    daysAgo: -4.9,
    status: "scheduled",
    voiceScore: 8,
    series: 1,
    position: 6,
    text: "Our gateway now routes by prompt length instead of arrival time.\n\nShort prompts used to queue behind 30k-token requests. Median wait for a 200-token prompt dropped from 840ms to 90ms.\n\nThe scheduler change was 60 lines. Finding the cause took three weeks of staring at queue depth graphs.\n\nMeasure the queue before you blame the model.",
  },
  {
    daysAgo: -2.8,
    status: "scheduled",
    voiceScore: 9,
    series: 2,
    position: 5,
    text: "The most useful eval we run is the one we are slightly embarrassed by.\n\nIt is 120 real failed traces, replayed every night. Pass rate: 68%.\n\nIt does not look good on a slide. It is the only number that has ever predicted a production regression before users did.\n\nKeep one eval that can hurt your feelings.",
  },
  {
    daysAgo: -0.9,
    status: "scheduled",
    voiceScore: 7,
    series: 0,
    text: "A quick note on GPU utilisation dashboards.\n\n82% utilisation sounds healthy. Ours was 82% while the cluster spent a third of its time waiting on KV-cache evictions.\n\nUtilisation tells you the GPU is busy. It does not tell you it is useful.\n\nTrack tokens per second per dollar instead.",
  },
  {
    daysAgo: 1.2,
    status: "published",
    voiceScore: 9,
    series: 1,
    position: 5,
    metrics: [5120, 214, 31],
    text: "We cut p99 latency on our inference gateway from 2.4s to 610ms last quarter.\n\nNo new hardware. No model change.\n\nThe fix was embarrassingly boring: we stopped batching by arrival time and started batching by prompt length.\n\nProfile the queue before you profile the model.",
  },
  {
    daysAgo: 3.3,
    status: "published",
    voiceScore: 8,
    series: 2,
    position: 4,
    metrics: [3480, 142, 22],
    text: "Our agent evals passed at 94% for six weeks. Production success rate was 71%.\n\nThe eval set was written by the same people who wrote the prompts. Of course it passed.\n\nWe rebuilt it from real failed traces. Pass rate fell to 68%, and now it actually predicts what users see.",
  },
  {
    daysAgo: 5.1,
    status: "published",
    voiceScore: 8,
    series: 0,
    metrics: [2210, 87, 9],
    text: "I reviewed 40 pull requests this month. The ones that merged fastest had one thing in common.\n\nThe description answered 'what breaks if this is wrong?' before the reviewer had to ask.\n\nIt costs the author two minutes and saves the reviewer twenty. Write that line.",
  },
  {
    daysAgo: 8.2,
    status: "published",
    voiceScore: 7,
    series: 1,
    position: 4,
    metrics: [1860, 64, 11],
    text: "Week 4 of building our inference gateway in the open.\n\nThis week: request hedging. We send a duplicate to a second replica after the p95 deadline passes. Tail latency fell 38%. Cost rose 6%.\n\nThat trade is almost always worth it. Almost.",
  },
  {
    daysAgo: 10.4,
    status: "published",
    voiceScore: 9,
    series: 0,
    metrics: [6240, 301, 47],
    text: "Hot take from three years of running LLM workloads: your retry policy is a bigger reliability lever than your model choice.\n\nWe had a 4% error rate that looked like model flakiness. It was our own retries stampeding a rate limit.\n\nBackoff with jitter dropped it to 0.3%. One afternoon of work.",
  },
  {
    daysAgo: 12.2,
    status: "failed",
    voiceScore: 8,
    series: 2,
    position: 3,
    failureReason: "LinkedIn API returned 429 (rate limited). Retry from History once the limit window resets.",
    text: "Three agent failure modes that never show up in a demo.\n\nTool-call loops that burn tokens quietly. Context that grows until the model forgets the original task. Success reported on a step that silently returned empty.\n\nAll three are visible in traces. None are visible in the final answer.",
  },
  {
    daysAgo: 15.1,
    status: "published",
    voiceScore: 8,
    series: 1,
    position: 3,
    metrics: [2740, 108, 15],
    text: "Here's the part nobody mentions about moving to a managed vector database: the migration is easy, the query-shape drift is not.\n\nWe re-ranked 10k historical queries on both systems. 18% returned a different top result.\n\nBudget a week for that diff before you cut over.",
  },
  {
    daysAgo: 19.3,
    status: "published",
    voiceScore: 7,
    series: 0,
    metrics: [1490, 52, 6],
    text: "A junior engineer asked why we still run a nightly job that replays yesterday's traffic against staging.\n\nBecause last March it caught a tokenizer change that would have silently truncated 3% of prompts.\n\nBoring infrastructure earns its keep once a year. That is enough.",
  },
  {
    daysAgo: 21.4,
    status: "failed",
    voiceScore: 6,
    series: 0,
    failureReason: "Publish attempt timed out after 3 tries. LinkedIn did not acknowledge the request.",
    text: "Small tooling win this week: we moved our CI cache key from the lockfile hash to the resolved dependency graph.\n\nCache hit rate went from 54% to 91%. Median build time dropped from 14 minutes to 6.\n\nIt took ten lines and one very annoying afternoon.",
  },
  {
    daysAgo: 24.2,
    status: "published",
    voiceScore: 9,
    series: 2,
    position: 2,
    metrics: [3920, 176, 28],
    text: "We deleted 6,000 lines of orchestration code last week and shipped a 200-line state machine in its place.\n\nThe framework gave us flexibility we never used and failure modes we could not see.\n\nIn production, I will take explicit over clever every time.",
  },
  {
    daysAgo: 28.1,
    status: "published",
    voiceScore: 8,
    series: 1,
    position: 1,
    metrics: [2080, 79, 13],
    text: "Starting a build-in-public series: the inference gateway we run in front of every model call.\n\nThe goal is to document what actually broke, with real numbers, as we go. Week 1: why we stopped trusting average latency and moved everything to p99.",
  },
];

function buildProjects(): DemoProject[] {
  return [
    {
      id: fixtureId(3, 1),
      userId: DEMO_USER_ID,
      title: "Building an inference gateway in public",
      description:
        "A weekly build-in-public log of the gateway that fronts every LLM call at work: routing, batching, hedging, and the incidents that shaped each decision.",
      arcType: "build_in_public",
      targetPosts: 12,
      status: "active",
      hashtags: ["LLMOps", "AIInfrastructure", "BuildInPublic"],
      createdAt: daysFromNow(-30),
      updatedAt: daysFromNow(-1),
      goal: "Document the gateway rebuild honestly, with measurements, so platform engineers can borrow the parts that work and skip the parts that did not.",
      targetAudience: "Platform and infrastructure engineers running LLM workloads in production",
      startDate: new Date(Date.now() - 30 * DAY).toISOString().slice(0, 10),
      endDate: new Date(Date.now() + 56 * DAY).toISOString().slice(0, 10),
      postTypePreferences: ["build_in_public", "data_insight", "tutorial_explainer"],
      projectSourceUrls: ["https://blog.vllm.ai"],
      projectTopics: ["request batching", "tail latency", "GPU scheduling", "request hedging"],
      autoGenerate: true,
      links: [
        { topicSubscriptionId: fixtureId(2, 1), priorityWeight: 5 },
        { topicSubscriptionId: fixtureId(2, 4), priorityWeight: 3 },
      ],
    },
    {
      id: fixtureId(3, 2),
      userId: DEMO_USER_ID,
      title: "Agent reliability field notes",
      description:
        "Short, evidence-first notes on why production agents fail and what finally made ours dependable: evals, traces, state machines, retries.",
      arcType: "weekly_recurring",
      targetPosts: 8,
      status: "active",
      hashtags: ["AIAgents", "LLMEvals", "Reliability"],
      createdAt: daysFromNow(-27),
      updatedAt: daysFromNow(-3),
      goal: "Become the person engineering leads send to when someone asks why their agent works in the demo and not in production.",
      targetAudience: "Engineering leads and senior engineers shipping LLM agents",
      startDate: new Date(Date.now() - 27 * DAY).toISOString().slice(0, 10),
      endDate: new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10),
      postTypePreferences: ["thought_leadership", "data_insight", "personal_story"],
      projectSourceUrls: [],
      projectTopics: ["agent evals", "tool-call failures", "state machines"],
      autoGenerate: true,
      links: [
        { topicSubscriptionId: fixtureId(2, 2), priorityWeight: 5 },
        { topicSubscriptionId: fixtureId(2, 3), priorityWeight: 2 },
      ],
    },
  ];
}

function buildPosts(projects: DemoProject[]): DemoPost[] {
  return POST_SEEDS.map((seed, index) => {
    const scheduledAt = daysFromNow(-seed.daysAgo);
    const published = seed.status === "published";
    const project = seed.series ? projects[seed.series - 1] : undefined;
    return {
      id: fixtureId(4, index + 1),
      status: seed.status,
      contentSnapshot: seed.text,
      scheduledAt,
      publishedAt: published ? scheduledAt : null,
      failureReason: seed.failureReason ?? null,
      linkedinPostId: published ? `urn:li:share:73${String(40000000000 + index * 173).slice(0, 10)}` : null,
      manualImpressions: seed.metrics?.[0] ?? null,
      manualReactions: seed.metrics?.[1] ?? null,
      manualComments: seed.metrics?.[2] ?? null,
      seriesId: project?.id ?? null,
      seriesPosition: project ? (seed.position ?? null) : null,
      draftId: fixtureId(5, index + 1),
      voiceScore: seed.voiceScore,
      seriesTitle: project?.title ?? null,
    };
  });
}

function buildStore(): Store {
  const projects = buildProjects();
  return {
    settings: {
      userId: DEMO_USER_ID,
      cadenceMode: "daily",
      draftsPerDay: 3,
      preferredDays: ["monday", "wednesday", "friday"],
      preferredTime: "09:00",
      timezone: "America/Los_Angeles",
      jitterMinutes: 15,
      tellFlagNumberedLists: "three_plus",
      tellFlagEmDash: true,
      tellFlagEngagementBeg: true,
      tellFlagBannedWords: true,
      tellFlagEveryLine: true,
      onboardingCompleted: true,
      lastCronStatus: "success_with_drafts",
      lastCronAt: isoFromNow(-3 * HOUR),
      betaAccessUntil: null,
      dailyResearchMode: "global_pool",
      momentsMode: "mix",
      weeklyPromptDismissedAt: null,
      updatedAt: daysFromNow(-6),
    },
    // The real handler returns the full row; the access token is deliberately omitted.
    linkedinToken: {
      id: fixtureId(6, 1),
      userId: DEMO_USER_ID,
      personUrn: "urn:li:person:demo",
      tokenExpiry: daysFromNow(50),
      status: "active",
      createdAt: daysFromNow(-10),
      updatedAt: daysFromNow(-10),
    },
    voice: buildVoice(),
    topics: buildTopics(),
    projects,
    posts: buildPosts(projects),
  };
}

type GlobalWithStore = typeof globalThis & { __voceDemoWorkspace?: Store };

function store(): Store {
  const g = globalThis as GlobalWithStore;
  if (!g.__voceDemoWorkspace) g.__voceDemoWorkspace = buildStore();
  return g.__voceDemoWorkspace;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** GET /api/settings -> { settings, linkedinToken } */
export function demoSettings() {
  const s = store();
  return { settings: s.settings, linkedinToken: s.linkedinToken };
}

/** PUT / PATCH /api/settings. Merges the body into the in-memory settings row. */
export function updateDemoSettings(body: unknown) {
  const s = store();
  if (body && typeof body === "object") {
    const allowed = [
      "cadenceMode",
      "draftsPerDay",
      "preferredDays",
      "preferredTime",
      "timezone",
      "jitterMinutes",
      "tellFlagNumberedLists",
      "tellFlagEmDash",
      "tellFlagEngagementBeg",
      "tellFlagBannedWords",
      "tellFlagEveryLine",
      "onboardingCompleted",
      "momentsMode",
    ];
    const incoming = body as Record<string, unknown>;
    for (const key of allowed) {
      if (key in incoming && incoming[key] !== undefined) s.settings[key] = incoming[key];
    }
    s.settings.updatedAt = new Date().toISOString();
  }
  return { success: true };
}

// ---------------------------------------------------------------------------
// Voice
// ---------------------------------------------------------------------------

/** GET /api/voice -> { voiceProfile } */
export function demoVoice() {
  return { voiceProfile: store().voice };
}

function calibrationFor(count: number): string {
  return count <= 2 ? "uncalibrated" : count <= 5 ? "partial" : count <= 7 ? "mostly" : "full";
}

/**
 * PUT /api/voice. Stores the text fields; skips the (paid) pattern extraction and
 * keeps the existing extracted patterns, which is what the demo account already has.
 */
export function putDemoVoice(body: {
  rawDescription?: string;
  samplePosts?: string[];
  personalContext?: string;
  userNotes?: string;
  userBannedWords?: string[];
}) {
  const v = store().voice;
  if (body.samplePosts !== undefined) {
    const posts = body.samplePosts.map((p) => p.trim()).filter((p) => p.length >= 100);
    if (posts.length === 0 && body.samplePosts.length > 0) {
      return { ok: false as const, error: "No valid posts found. Each post must be at least 100 characters." };
    }
    v.samplePosts = posts;
    v.samplePostCount = posts.length;
    v.calibrationQuality = calibrationFor(posts.length);
    v.calibrated = posts.length >= 3;
  }
  if (body.rawDescription !== undefined) {
    v.rawDescription = body.rawDescription.trim()
      ? sanitiseShortText(body.rawDescription, FIELD_LIMITS.samplePost)
      : null;
  }
  if (body.personalContext !== undefined) {
    const next = body.personalContext.trim()
      ? sanitiseShortText(body.personalContext, FIELD_LIMITS.personalContext)
      : null;
    if (!next) v.personalContextComponents = [];
    v.personalContext = next;
  }
  if (body.userNotes !== undefined) v.userNotes = sanitiseShortText(body.userNotes, FIELD_LIMITS.userNotes);
  if (body.userBannedWords !== undefined) v.userBannedWords = sanitiseBannedWords(body.userBannedWords);
  v.updatedAt = new Date().toISOString();
  return { ok: true as const };
}

/** PATCH /api/voice/overrides. Mirrors the real handler's optional-field semantics. */
export function patchDemoVoiceOverrides(body: {
  userBannedWords?: string[];
  userNotes?: string;
  signaturePhrases?: string[];
  neverPatterns?: string[];
  postStructureTemplate?: string;
  emojiNeverOverride?: boolean;
  hookStyle?: string;
  paragraphStyle?: string;
  toneMarkers?: string[];
  emojiFrequency?: string;
}) {
  const v = store().voice;
  if (body.userBannedWords !== undefined) v.userBannedWords = sanitiseBannedWords(body.userBannedWords);
  if (body.userNotes !== undefined) v.userNotes = sanitiseShortText(body.userNotes, FIELD_LIMITS.userNotes);
  if (body.signaturePhrases !== undefined) v.signaturePhrases = body.signaturePhrases;
  if (body.neverPatterns !== undefined) v.neverPatterns = body.neverPatterns;
  if (body.postStructureTemplate !== undefined) v.postStructureTemplate = body.postStructureTemplate;
  if (body.emojiNeverOverride !== undefined) v.emojiNeverOverride = body.emojiNeverOverride;
  if (body.hookStyle !== undefined) v.hookStyle = body.hookStyle.trim() ? body.hookStyle.trim() : null;
  if (body.paragraphStyle !== undefined) v.paragraphStyle = body.paragraphStyle.trim() ? body.paragraphStyle.trim() : null;
  if (body.toneMarkers !== undefined) v.toneMarkers = body.toneMarkers;
  if (body.emojiFrequency !== undefined) {
    const prev = (v.extractedPatterns as Record<string, unknown> | null) ?? {};
    v.extractedPatterns = { ...prev, emojiFrequency: body.emojiFrequency };
  }
  v.updatedAt = new Date().toISOString();
  return { success: true };
}

// ---------------------------------------------------------------------------
// Topics
// ---------------------------------------------------------------------------

/** GET /api/topics -> { topics } */
export function demoTopics() {
  return { topics: store().topics };
}

/** POST /api/topics -> { topic }. Returns null when label or query is missing (real handler: 400). */
export function createDemoTopic(body: {
  topicLabel?: string;
  tavilyQuery?: string;
  sourceUrls?: string[];
  priorityWeight?: number;
}): DemoTopic | null {
  const topicLabel = body.topicLabel?.trim();
  const tavilyQuery = body.tavilyQuery?.trim();
  if (!topicLabel || !tavilyQuery) return null;
  const now = new Date().toISOString();
  const topic: DemoTopic = {
    id: newId(),
    userId: DEMO_USER_ID,
    topicLabel,
    tavilyQuery,
    priorityWeight: body.priorityWeight ?? 3,
    tavilyQuerySuggested: null,
    tavilyQueryConfirmed: false,
    sourceUrls: body.sourceUrls ?? [],
    active: true,
    createdAt: now,
    updatedAt: now,
    lastResearchFetchAt: null,
    lastResearchFetchStatus: null,
  };
  store().topics.push(topic);
  return topic;
}

/** PATCH /api/topics?id= -> { topic }, or null when the id is unknown (real handler: 404). */
export function updateDemoTopic(
  id: string,
  body: { topicLabel?: string; tavilyQuery?: string; sourceUrls?: string[]; priorityWeight?: number },
): DemoTopic | null {
  const topic = store().topics.find((t) => t.id === id);
  if (!topic) return null;
  if (body.topicLabel !== undefined) topic.topicLabel = body.topicLabel.trim();
  if (body.tavilyQuery !== undefined) topic.tavilyQuery = body.tavilyQuery.trim();
  if (body.sourceUrls !== undefined) topic.sourceUrls = body.sourceUrls;
  if (body.priorityWeight !== undefined) topic.priorityWeight = body.priorityWeight;
  topic.updatedAt = new Date().toISOString();
  return topic;
}

/** DELETE /api/topics?id= */
export function deleteDemoTopic(id: string) {
  const s = store();
  s.topics = s.topics.filter((t) => t.id !== id);
  for (const project of s.projects) {
    project.links = project.links.filter((l) => l.topicSubscriptionId !== id);
  }
  return { success: true };
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

function linkedTopicsFor(project: DemoProject) {
  const topics = store().topics;
  return project.links.flatMap((link) => {
    const topic = topics.find((t) => t.id === link.topicSubscriptionId);
    return topic
      ? [
          {
            topicSubscriptionId: link.topicSubscriptionId,
            topicLabel: topic.topicLabel,
            priorityWeight: link.priorityWeight,
          },
        ]
      : [];
  });
}

function statsFor(projectId: string) {
  const inSeries = store().posts.filter((p) => p.seriesId === projectId);
  const lastPublished = inSeries
    .map((p) => p.publishedAt)
    .filter((d): d is string => Boolean(d))
    .sort()
    .pop();
  return { postsPublished: inSeries.length, lastPublishedAt: lastPublished ?? null };
}

function projectSummary(project: DemoProject) {
  const stats = statsFor(project.id);
  return {
    id: project.id,
    title: project.title,
    goal: project.goal,
    targetAudience: project.targetAudience,
    status: project.status,
    arcType: project.arcType,
    startDate: project.startDate,
    endDate: project.endDate,
    targetPosts: project.targetPosts,
    postTypePreferences: project.postTypePreferences,
    autoGenerate: project.autoGenerate,
    hashtags: project.hashtags,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    postsPublished: stats.postsPublished,
    lastPublishedAt: stats.lastPublishedAt,
    linkedTopics: linkedTopicsFor(project),
  };
}

/** GET /api/projects -> { projects } */
export function demoProjects() {
  return { projects: store().projects.map(projectSummary) };
}

/** GET /api/projects/[id] -> { project }, or null (real handler: 404). */
export function demoProjectDetail(id: string) {
  const project = store().projects.find((p) => p.id === id);
  if (!project) return null;
  const recentPosts = store()
    .posts.filter((p) => p.seriesId === id)
    .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))
    .slice(0, 10)
    .map((post) => ({
      id: post.id,
      contentSnapshot: post.contentSnapshot,
      status: post.status,
      publishedAt: post.publishedAt,
      scheduledAt: post.scheduledAt,
      voiceScore: post.voiceScore,
    }));
  return {
    project: {
      ...projectSummary(project),
      description: project.description,
      projectSourceUrls: project.projectSourceUrls,
      projectTopics: project.projectTopics,
      recentPosts,
    },
  };
}

/** POST /api/projects -> { project } (list-shaped, like the real handler). */
export function createDemoProject(body: {
  title?: string;
  goal?: string;
  targetAudience?: string;
  arcType?: string;
  targetPosts?: number;
  startDate?: string;
  endDate?: string;
  postTypePreferences?: string[];
  projectSourceUrls?: string[];
  projectTopics?: string[];
  hashtags?: string[];
  autoGenerate?: boolean;
  linkedTopics?: Array<{ topicSubscriptionId: string; priorityWeight: number }>;
}) {
  const s = store();
  const now = new Date().toISOString();
  const allowed = new Set(s.topics.map((t) => t.id));
  const project: DemoProject = {
    id: newId(),
    userId: DEMO_USER_ID,
    title: (body.title ?? "").trim(),
    description: null,
    arcType: body.arcType ?? null,
    targetPosts: body.targetPosts ?? null,
    status: "active",
    hashtags: body.hashtags ?? [],
    createdAt: now,
    updatedAt: now,
    goal: body.goal?.trim() ? sanitiseShortText(body.goal, FIELD_LIMITS.goal) : null,
    targetAudience: body.targetAudience?.trim()
      ? sanitiseShortText(body.targetAudience, FIELD_LIMITS.targetAudience)
      : null,
    startDate: body.startDate ?? null,
    endDate: body.endDate ?? null,
    postTypePreferences: body.postTypePreferences ?? [],
    projectSourceUrls: body.projectSourceUrls ?? [],
    projectTopics: body.projectTopics ?? [],
    autoGenerate: body.autoGenerate ?? true,
    links: (body.linkedTopics ?? [])
      .filter((t) => allowed.has(t.topicSubscriptionId))
      .map((t) => ({
        topicSubscriptionId: t.topicSubscriptionId,
        priorityWeight: Math.min(5, Math.max(1, t.priorityWeight)),
      })),
  };
  s.projects.push(project);
  return { project: projectSummary(project) };
}

/** PATCH /api/projects/[id] -> { project } (raw-row shaped), or null (real handler: 404). */
export function updateDemoProject(id: string, body: Record<string, unknown>) {
  const project = store().projects.find((p) => p.id === id);
  if (!project) return null;
  const fields = [
    "title",
    "goal",
    "targetAudience",
    "description",
    "arcType",
    "targetPosts",
    "startDate",
    "endDate",
    "postTypePreferences",
    "projectSourceUrls",
    "projectTopics",
    "hashtags",
    "autoGenerate",
    "status",
  ] as const;
  const target = project as unknown as Record<string, unknown>;
  for (const field of fields) {
    if (field in body) target[field] = body[field];
  }
  project.updatedAt = new Date().toISOString();
  const { links, ...row } = project;
  void links;
  return { project: row };
}

/** DELETE /api/projects/[id] archives the project (status -> completed), like the real handler. */
export function archiveDemoProject(id: string) {
  const project = store().projects.find((p) => p.id === id);
  if (project) {
    project.status = "completed";
    project.updatedAt = new Date().toISOString();
  }
  return { success: true };
}

/** Link or re-weight a topic on a project. Exported for a /api/projects/[id]/topics demo guard. */
export function linkDemoProjectTopic(projectId: string, topicSubscriptionId: string, priorityWeight: number) {
  const project = store().projects.find((p) => p.id === projectId);
  if (!project) return false;
  const weight = Math.min(5, Math.max(1, priorityWeight));
  const existing = project.links.find((l) => l.topicSubscriptionId === topicSubscriptionId);
  if (existing) existing.priorityWeight = weight;
  else project.links.push({ topicSubscriptionId, priorityWeight: weight });
  return true;
}

/** Unlink a topic from a project. Exported for a /api/projects/[id]/topics demo guard. */
export function unlinkDemoProjectTopic(projectId: string, topicSubscriptionId: string) {
  const project = store().projects.find((p) => p.id === projectId);
  if (!project) return false;
  project.links = project.links.filter((l) => l.topicSubscriptionId !== topicSubscriptionId);
  return true;
}

// ---------------------------------------------------------------------------
// Posts + insights
// ---------------------------------------------------------------------------

/** GET /api/posts -> { posts }, newest scheduled first, capped at 100 like the real query. */
export function demoPosts() {
  const posts = [...store().posts].sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt)).slice(0, 100);
  return { posts };
}

/** Append a post (e.g. when the demo approves a draft). Optional hook for the drafts routes. */
export function addDemoPost(post: Partial<DemoPost> & { contentSnapshot: string; scheduledAt: string }) {
  const full: DemoPost = {
    id: newId(),
    status: "scheduled",
    publishedAt: null,
    failureReason: null,
    linkedinPostId: null,
    manualImpressions: null,
    manualReactions: null,
    manualComments: null,
    seriesId: null,
    seriesPosition: null,
    draftId: newId(),
    voiceScore: null,
    seriesTitle: null,
    ...post,
  };
  store().posts.push(full);
  return full;
}

type RejectionReasonRow = typeof rejectionReasons.$inferSelect;

const REJECTION_SEEDS: Array<{ code: string; type: string; text: string; daysAgo: number }> = [
  { code: "sounds_like_ai", type: "voice", text: "Opened with a rhetorical question, which I never do.", daysAgo: 2 },
  { code: "too_listy", type: "voice", text: "Turned a story into a five-point list.", daysAgo: 6 },
  { code: "wrong_topic", type: "research", text: "Funding-round news. Not what I write about.", daysAgo: 9 },
  { code: "too_formal", type: "voice", text: "Reads like a press release, not me.", daysAgo: 14 },
  { code: "factually_off", type: "research", text: "Benchmark number did not match the source.", daysAgo: 22 },
];

/**
 * Figures for /insights. Derived from the demo posts so the page agrees with /history:
 * every post was an approved draft, plus a handful of rejected drafts.
 * These are illustrative, and the insights page says so.
 */
export function demoInsights() {
  const posts = store().posts;
  const weekAgo = Date.now() - 7 * DAY;
  const approved = posts.length;
  const rejected = REJECTION_SEEDS.length + 1; // 5 with a recorded reason, 1 dismissed without one
  const published = posts.filter((p) => p.status === "published");
  const postsThisWeek = published.filter((p) => p.publishedAt && new Date(p.publishedAt).getTime() >= weekAgo).length;
  const scored = [...posts]
    .filter((p) => p.voiceScore !== null)
    .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))
    .slice(0, 10);
  const avgVoiceScore = scored.length
    ? Math.round((scored.reduce((sum, p) => sum + (p.voiceScore ?? 0), 0) / scored.length) * 10) / 10
    : null;
  const reasons: RejectionReasonRow[] = REJECTION_SEEDS.map((seed, i) => ({
    id: fixtureId(7, i + 1),
    userId: DEMO_USER_ID,
    draftId: fixtureId(8, i + 1),
    reasonCode: seed.code,
    rejectionType: seed.type,
    freeText: seed.text,
    createdAt: new Date(Date.now() - seed.daysAgo * DAY),
  }));
  return { approved, rejected, postsThisWeek, avgVoiceScore, reasons };
}

// ---------------------------------------------------------------------------
// Demo-guard helpers for the remaining routes (voice re-extract, project
// generation, History row actions). Non-destructive: nothing here leaves memory.
// ---------------------------------------------------------------------------

/** POST /api/voice/extract-personal-context. Null when no personal context is saved (real handler: 400). */
export function reExtractDemoPersonalContext(): { components: string[]; count: number } | null {
  const v = store().voice;
  const raw = typeof v.personalContext === "string" ? v.personalContext.trim() : "";
  if (!raw) return null;
  const components = [...PERSONAL_CONTEXT_COMPONENTS];
  v.personalContextComponents = components;
  v.updatedAt = new Date().toISOString();
  return { components, count: components.length };
}

/** Position + title for the next project-scoped draft, or null for an unknown project (real handler: 404). */
export function demoProjectNextPosition(projectId: string) {
  const project = store().projects.find((p) => p.id === projectId);
  if (!project) return null;
  const published = store().posts.filter((p) => p.seriesId === projectId && p.status === "published").length;
  return { title: project.title, seriesPosition: published + 1 };
}

/** Whether a topic subscription exists in the demo store. */
export function demoTopicExists(topicSubscriptionId: string) {
  return store().topics.some((t) => t.id === topicSubscriptionId);
}

/** Look up a demo post by id. */
export function getDemoPost(id: string): DemoPost | null {
  return store().posts.find((p) => p.id === id) ?? null;
}

/** History "Retry": failed -> scheduled a little way out, failure cleared. Null if not a failed post. */
export function retryDemoPost(id: string): DemoPost | null {
  const post = store().posts.find((p) => p.id === id);
  if (!post || post.status !== "failed") return null;
  post.status = "scheduled";
  post.failureReason = null;
  post.scheduledAt = new Date(Date.now() + 30 * 60_000).toISOString();
  return post;
}

/** History "Move to inbox": drops the post from the demo store (in memory only). Returns the removed post. */
export function removeDemoPost(id: string): DemoPost | null {
  const s = store();
  const index = s.posts.findIndex((p) => p.id === id);
  if (index === -1) return null;
  return s.posts.splice(index, 1)[0] ?? null;
}

/** History "Reschedule": update scheduledAt on a post. Null if the post is unknown. */
export function rescheduleDemoPost(id: string, scheduledAt: string): DemoPost | null {
  const post = store().posts.find((p) => p.id === id);
  if (!post) return null;
  post.scheduledAt = scheduledAt;
  return post;
}

/** History "Metrics": set the manual* fields that were provided. Null if the post is unknown. */
export function setDemoPostMetrics(
  id: string,
  metrics: { manualImpressions?: number; manualReactions?: number; manualComments?: number },
): DemoPost | null {
  const post = store().posts.find((p) => p.id === id);
  if (!post) return null;
  if (metrics.manualImpressions !== undefined) post.manualImpressions = metrics.manualImpressions;
  if (metrics.manualReactions !== undefined) post.manualReactions = metrics.manualReactions;
  if (metrics.manualComments !== undefined) post.manualComments = metrics.manualComments;
  return post;
}
