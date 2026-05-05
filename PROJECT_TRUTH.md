# PROJECT_TRUTH.md — Voce Ground Truth
> Auto-generated from codebase. Update this file whenever something real changes.
> This is the file other AI sessions read first. Every line must be accurate.
> Last updated: 2026-05-05

---

## What This App Is

Voce is a LinkedIn-focused AI writing assistant: it ingests research (RSS, Tavily, etc.), generates draft posts in a user’s calibrated voice, surfaces them in an inbox with deterministic quality scanning and an async fact-check verifier, and schedules human-approved posts for publishing to LinkedIn. The core loop is research → draft generation → user review/approve → scheduled publish via Trigger.dev. Self-serve users sign up with email and password, complete multi-step onboarding (voice, topics, LinkedIn, scheduling, first draft), then may start Stripe billing (14-day trial, $10/mo) before or after using the product depending on flow.

---

## Stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 15 App Router | `next` ^15.5.15 in package.json |
| Hosting | Vercel | `vercel.json` defines crons; hosting not named in repo |
| Database | Supabase (Postgres) | `DATABASE_URL` via `postgres` driver |
| ORM | Drizzle | Schema in `src/lib/db/schema.ts`; runtime queries use `drizzle-orm` + `db` in `src/lib/db/index.ts` |
| Schema changes | Migrations + raw SQL | `src/lib/db/migrations/*.sql` (latest: `0010_personal_context_components.sql`) and `drizzle.config.ts` |
| Auth | Supabase Auth | **Email + password** in browser: `signInWithPassword` (login), `signUp` (signup). No magic link in UI. `/api/auth/login` POST is **disabled** (410). |
| Background jobs | Trigger.dev | `@trigger.dev/sdk` **4.4.5** in package.json; task files import `@trigger.dev/sdk/v3`. `trigger.config.ts` project id: `proj_gutapfjoxgjzsbxyfgmi` |
| Research (HTTP) | Vercel Cron | `vercel.json`: **only** `GET/POST /api/cron/research` at `0 2 * * *` |
| Research (Trigger) | Trigger.dev schedule | `researchTask` in `src/trigger/research.ts` uses cron `0 2 * * *` |
| Generate / publish crons | Next.js API routes | `/api/cron/generate`, `/api/cron/publish` exist with `CRON_SECRET` bearer check; **not** listed in `vercel.json` — must be scheduled externally or manually |
| LLM | Anthropic API | Primary draft: `claude-sonnet-4-6` (`generate-draft.ts`). Haiku `claude-haiku-4-5-20251001` used in: judge-research (Phase 1 daily cron), score-voice, score-research, extract-voice (sample-post stylometry), extract-personal-context (component extraction on save), select-personal-context (per-draft selection in personalize), fact-check (post-generation source-grounding verifier). |
| Research API | Tavily | `TAVILY_API_KEY`, `@tavily/core` |
| LinkedIn | OAuth + REST | OAuth scope `openid profile email w_member_social`. Publish: `POST https://api.linkedin.com/rest/posts` with header `LinkedIn-Version: 202510` |
| Billing | Stripe | `stripe` ^22.1.0; Checkout, Customer Portal, webhooks |
| UI | Tailwind + shadcn/ui | `tailwindcss` 4, `@base-ui/react`, Radix popover, lucide-react |
| Tests | Vitest 4 | `vitest.config.mts` (ESM); `npm test` runs `vitest run`; tests in `tests/` |

---

## Project Structure

```
src/app/
  api/          # Route handlers (account, auth, billing, cron, drafts, inbox, posts, projects, settings, topics, voice)
  archive/      # page.tsx
  auth/         # callback/route.ts (Supabase OAuth code exchange)
  history/      # page.tsx
  inbox/        # page.tsx (RSC) + inbox-client.tsx
  insights/     # page.tsx
  login/        # page.tsx
  onboarding/   # page.tsx (client, 5 steps)
  projects/     # page.tsx, [id]/page.tsx
  settings/     # page.tsx (RSC) + settings-client.tsx
  signup/       # page.tsx
  layout.tsx, page.tsx (redirects / → /inbox), globals.css

src/lib/
  ai/
    generate-draft.ts          # primary draft generation (Sonnet)
    quality-rules.ts           # unified source of truth: prompt rules + scan-rule metadata
    quality-scan.ts            # deterministic post-generation scan (no Haiku)
    scan-draft.ts              # public surface; wraps quality-scan + applyFactCheck
    fact-check.ts              # async source-grounding verifier (Haiku)
    extract-voice.ts           # sample-post stylometry extraction (Haiku, 2-pass)
    extract-personal-context.ts  # personal_context → components (Haiku, fail-open)
    select-personal-context.ts   # per-draft component selection (Haiku, fail-open)
    score-voice.ts             # voice consistency scoring (Haiku)
    score-research.ts          # research relevance/originality scoring (Haiku)
    judge-research.ts          # Phase 1 daily cron judge (Haiku)
    rank-research.ts           # priority weights + per-user candidate ranking
    structure-templates.ts     # post structure template selection
    voice-slice.ts             # shared voice-prompt slice builder
    tavily.ts                  # Tavily client (fetchTavily, fetchTavilyItems)
    prompts.ts                 # sanitisation helpers for prompt inputs
  db/           # index.ts, schema.ts, migrations/
  linkedin/     # oauth.ts, publish.ts
  pipeline/     # generate.ts, publish.ts, research.ts
  research/     # rss.ts (Tavily lives in lib/ai/tavily.ts)
  supabase/     # client.ts, server.ts, middleware.ts
  auth.ts, subscription.ts, sanitise.ts, scheduler.ts, utils.ts, projects.ts

src/components/
  layout/ (AppShell, Sidebar), ui/ (shadcn-style primitives), DraftCard, Nav, Toast,
  SchedulingForm, RejectionModal, LinkedInPreview, VoiceScoreBadge, TokenExpiryBanner,
  projects/NewProjectWizard

src/trigger/
  publish.ts            # publish-post task
  generate.ts           # generate-drafts scheduled task
  research.ts           # daily-research scheduled task
  scheduleUserGenerate.ts  # schedule-user-generate schema task
```

---

## Auth Pattern

`getAuthenticatedUser()` (`src/lib/auth.ts`):

1. Creates Supabase server client via `createServerSupabaseClient()` (`src/lib/supabase/server.ts` — cookie-backed `createServerClient`).
2. Calls `supabase.auth.getUser()`.
3. If `error` or no `user`: returns `{ user: null, userId: null, unauthorized: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }`.
4. Else: returns `{ user, userId: user.id, unauthorized: null }`.

There is also `requireAuth()` which throws if no `userId` (used sparingly).

```typescript
// Exact import and usage pattern API routes follow:
import { getAuthenticatedUser } from "@/lib/auth";

export async function POST() {
  const { userId, unauthorized } = await getAuthenticatedUser();
  if (unauthorized) return unauthorized;
  // ... use userId
}
```

**Public paths** (no session required for matched routes — from `src/middleware.ts`):

- `/login`
- `/signup`
- `/auth/callback`
- `/api/cron/` (prefix)
- `/api/billing/webhook` (prefix)

`/api/cron/*` additionally requires `Authorization: Bearer ${CRON_SECRET}` when `CRON_SECRET` is set.

All other matched routes: if no Supabase user, redirect to `/login`.

**Session refresh:** `src/lib/supabase/middleware.ts` calls `getUser()` on each request to refresh the session; cookies are written on `setAll`.

---

## Database Schema

RLS is **not** defined in this repository (no SQL policies in Drizzle schema). If RLS exists, it lives only in Supabase — **verify in dashboard**.

| Table | Purpose | Key columns (representative) | RLS in repo |
|---|---|---|---|
| `research_items` | Global research corpus | `url`, `dedup_hash`, `source_type`, scores, timestamps | No |
| `topic_subscriptions` | User topics + Tavily query | `user_id`, `topic_label`, `tavily_query`, `active`, `priority_weight`, `last_research_fetch_at`, `last_research_fetch_status` | No |
| `content_series` | Projects / series | `user_id`, `title`, `goal`, `project_topics`, `auto_generate` | No |
| `series_topic_subscriptions` | Project ↔ topic link | `series_id`, `topic_subscription_id`, `priority_weight` | No |
| `draft_queue` | Generated drafts | `user_id`, `draft_text`, `status`, `stale_after`, `series_id`, `ai_tell_flags`, `topic_subscription_id`, `topic_label`, `source` (`'cron'` \| `'quick_generate'` \| `'onboarding'`) | No |
| `regeneration_history` | Regeneration audit | `user_id`, `draft_id`, instruction, before/after text | No |
| `rejection_reasons` | Rejection taxonomy + free text | `user_id`, `draft_id`, `reason_code`, `rejection_type` | No |
| `posts` | Scheduled/published posts | `user_id`, `draft_id`, `scheduled_at`, `status`, `linkedin_post_id` | No |
| `voice_profiles` | Voice calibration + overrides | `user_id` unique, `sample_posts`, `personal_context` (text, max 1500), **`personal_context_components` (jsonb default `[]`)**, stylometric fields, `generation_guidance` | No |
| `draft_memories` | Approved-draft memory | `user_id`, `approved`, `structure_used`, edit stats | No |
| `linkedin_tokens` | LinkedIn OAuth tokens | `user_id` unique, `access_token`, `person_urn`, `token_expiry`, `status` | No |
| `user_settings` | Cadence, tell flags, onboarding, per-user cron observability, beta access, **research mode** | `user_id` PK, `preferred_days`, `onboarding_completed`, tell flags, `last_cron_status`, `last_cron_at`, `beta_access_until`, **`daily_research_mode` (`'global_pool'` default \| `'per_user_tavily'`)** | No |
| `cron_runs` | Cron run logs | `phase`, `ran_at`, `result` (jsonb — includes `factCheck` aggregate when generation ran), `success` | No |
| `subscriptions` | Stripe subscription mirror | `user_id` unique, `stripe_customer_id`, `stripe_subscription_id`, `status`, trial/period end | No |

---

## API Routes

Format: `METHOD /api/path` — behavior

- **GET/POST** `/api/cron/research` — Runs `runResearchPipeline` + `logResearchRun`; bearer `CRON_SECRET`.
- **GET/POST** `/api/cron/generate` — `runGenerateForDueUsers` + `logGenerateRun`; bearer `CRON_SECRET`.
- **GET/POST** `/api/cron/publish` — `runPublishForDueUsers` + `logPublishRun`; bearer `CRON_SECRET`.
- **GET** `/api/cron/status` — Status helper (auth via query — read file if needed for details).
- **DELETE** `/api/account` — Deletes user data (uses service role for Supabase user deletion per implementation).
- **POST** `/api/account/export` — JSON export download.
- **GET** `/api/auth/linkedin` — Redirects to LinkedIn authorize URL.
- **GET** `/api/auth/linkedin/callback` — OAuth callback; stores tokens; may trigger `scheduleUserGenerateTask`.
- **POST** `/api/auth/login` — **410** “Password auth disabled”.
- **POST** `/api/auth/logout` — Server sign-out (implementation in file).
- **POST** `/api/auth/signout` — `signOut` + redirect (see Known Issues for redirect base URL).
- **POST** `/api/billing/checkout` — Authenticated Stripe Checkout session; 14-day trial; success → `${NEXT_PUBLIC_APP_URL}/inbox`.
- **POST** `/api/billing/portal` — Authenticated Stripe Customer Portal; return `/settings`.
- **POST** `/api/billing/webhook` — Stripe signed webhook; updates `subscriptions` (no user auth).
- **GET** `/api/drafts` — List drafts (query filters).
- **POST** `/api/drafts/generate-one` — Generate one draft; **402** if `!canGenerate` (beta or subscription).
- **POST** `/api/drafts/generate-quick` — On-demand quick generate from a typed topic via Tavily; **402** if `!canGenerate`; daily cap of 3 per user.
- **POST** `/api/drafts/[id]/approve` — Approve + schedule + Trigger publish; **402** if `!canPublish`.
- **PUT** `/api/drafts/[id]/edit` — Edit draft text.
- **POST** `/api/drafts/[id]/personalize` — Targeted personalization. Returns **400 `code: NO_PERSONAL_CONTEXT`** when both `personal_context` and `personal_context_components` are empty (see Personal Context Extraction). Otherwise returns the regenerated draft plus a `personalization` metadata object (`mode: 'targeted' | 'no_fit' | 'legacy_raw_context'`).
- **POST** `/api/drafts/[id]/regenerate` — Regenerate; **402** if `!canGenerate`.
- **POST** `/api/drafts/[id]/reject` — Reject with reason.
- **GET** `/api/inbox/count` — Pending draft count.
- **GET** `/api/posts` — List posts.
- **PATCH** `/api/posts/[id]/metrics` — Manual metrics.
- **POST** `/api/posts/[id]/reschedule` — Reschedule.
- **POST** `/api/posts/[id]/retry` — Retry failed publish.
- **POST** `/api/posts/[id]/unschedule` — Unschedule.
- **GET** `/api/projects` — List projects.
- **POST** `/api/projects` — Create project.
- **GET** `/api/projects/[id]` — Get project.
- **PATCH** `/api/projects/[id]` — Update project.
- **DELETE** `/api/projects/[id]` — Delete project.
- **POST** `/api/projects/[id]/generate` — Project-scoped draft generation; **402** if `!canGenerate` (beta or subscription).
- **POST** `/api/projects/[id]/topics` — Link topic to project.
- **DELETE** `/api/projects/[id]/topics` — Unlink topic.
- **GET** `/api/settings` — Settings + LinkedIn token summary.
- **PUT** `/api/settings` — Replace settings (e.g. onboarding completed).
- **PATCH** `/api/settings` — Partial update.
- **GET** `/api/topics` — List topics.
- **POST** `/api/topics` — Create topic.
- **PATCH** `/api/topics` — Update topic (id in query/body per implementation).
- **DELETE** `/api/topics` — Delete topic.
- **POST** `/api/topics/suggest-query` — AI-suggested Tavily query.
- **GET** `/api/voice` — Voice profile (includes `personal_context_components`).
- **PUT** `/api/voice` — Update voice / sample posts. **Re-extracts `personal_context_components` synchronously when `personal_context` changed** vs the existing row (skips otherwise).
- **POST** `/api/voice/extract` — Run sample-post stylometry extraction (existing).
- **POST** `/api/voice/extract-personal-context` — Re-run component extraction on the currently-saved `personal_context` and persist; backs the "Re-extract components" settings button. **400 `code: NO_PERSONAL_CONTEXT`** if `personal_context` is unset.
- **PATCH** `/api/voice/overrides` — Override fields.

---

## Pages

| Path | Description | Access |
|---|---|---|
| `/` | Redirects to `/inbox` | Middleware runs; unauthenticated users redirect to `/login` before hitting redirect |
| `/login` | Email/password sign-in (Supabase client) | **Public** |
| `/signup` | Email/password sign-up; optional email-confirm message | **Public** |
| `/auth/callback` | OAuth/code exchange route (not a `page.tsx`) | **Public** (middleware) |
| `/onboarding` | 5-step onboarding (voice, topics, LinkedIn, scheduling, first draft + Stripe CTA) | Auth required |
| `/inbox` | Draft inbox; `past_due` payment banner when applicable | Auth required |
| `/settings` | Settings + billing card (server loads subscription snapshot) | Auth required |
| `/projects` | Projects list | Auth required |
| `/projects/[id]` | Project detail | Auth required |
| `/history` | History UI | Auth required |
| `/archive` | Archive UI | Auth required |
| `/insights` | Insights UI | Auth required |

---

## Environment Variables

Referenced in application source (`src/`, `middleware.ts`, root `trigger.config.ts` uses project id in file — no env for project id):

| Variable | Purpose | Required for |
|---|---|---|
| `DATABASE_URL` | Postgres connection | DB access |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL (browser + server clients) | Auth, DB-adjacent |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | Auth |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (e.g. account deletion) | Account route operations |
| `ANTHROPIC_API_KEY` | Claude API | AI features |
| `TAVILY_API_KEY` | Tavily search | Research |
| `LINKEDIN_CLIENT_ID` | OAuth | LinkedIn connect |
| `LINKEDIN_CLIENT_SECRET` | OAuth | LinkedIn connect |
| `LINKEDIN_REDIRECT_URI` | OAuth callback | LinkedIn connect |
| `CRON_SECRET` | Bearer for `/api/cron/*` + middleware | Cron + `getCronSecret()` |
| `STRIPE_SECRET_KEY` | Stripe API | Billing routes |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature | `/api/billing/webhook` |
| `STRIPE_PRICE_ID` | Subscription price id | Checkout |
| `NEXT_PUBLIC_APP_URL` | Absolute app origin (trailing slash stripped in billing) | Stripe return URLs |

**Not referenced in `src/` grep:** `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (may exist in `.env` for future use).
**`.env.local` / deployment:** may contain other keys (e.g. `AUTH_SECRET`, `TRIGGER_SECRET_KEY`) — not found in `process.env` grep under `src/`; verify if used by Trigger.dev CLI or hosting only.

---

## Trigger.dev Tasks

| File | Task id | Type | Behavior |
|---|---|---|---|
| `publish.ts` | `publish-post` | `schemaTask` | Payload: `postId`, `userId`. Calls `runPublishForPost`. Max duration 60s; retries 3. **Triggered from API** (e.g. after approve) with delay. |
| `generate.ts` | `generate-drafts` | `schedules.task` | Payload schedule: `externalId` = `userId`. Archives stale pending drafts, runs `runGeneratePipelineForUser` (which dispatches on `daily_research_mode` — see Daily Generation Pipeline). Max 300s. |
| `research.ts` | `daily-research` | `schedules.task` | Cron `0 2 * * *`. Runs `runResearchPipeline`, `logResearchRun`. Max 600s. |
| `scheduleUserGenerate.ts` | `schedule-user-generate` | `schemaTask` | Creates/deletes Trigger schedule for `generate-drafts` per user timezone/cadence; `on_demand` deletes schedule. |

---

## Quality Rules System

`src/lib/ai/quality-rules.ts` is the **single source of truth** for both the generation prompt's rule content and the post-generation scan's rule metadata. There is no longer a separate prompt-rule list and scan-rule list — the previously-scattered `AI_TELL_BLOCKLIST_PROMPT`, `scan-draft` helpers, and `AI_TELL_SCAN_PROMPT` were collapsed into this unified system in Session 1's quality-rules rebuild.

### `QualityRule` shape

Each rule carries:
- `id` (e.g. `lex_word_choices`, `struct_em_dash`, `lex_source_grounding`, `fact_check_unsupported_claims`).
- `category` (`'lexical' | 'phrase' | 'structural'`) — affects display grouping only.
- `description` — short user-facing string used in inbox banner messages.
- `defaultThreshold` — number or `'never'`; numeric thresholds drive scan decisions.
- `userOverridable: boolean` and optional `userSettingsFlag` (e.g. `tellFlagEmDash`) — controls strict vs. default prompt instruction selection and scan gating.
- `action` (`'flag' | 'auto_strip' | 'regenerate'`) — `auto_strip` for markdown leak; `regenerate` for engagement begs; `flag` is the default review path.
- `promptInstructionDefault` and optional `promptInstructionStrict` — the text injected into the system prompt.
- Optional synchronous `scanFunction` on the `QualityRule` interface (legacy field; the actual scan registry lives in `quality-scan.ts`'s `SCAN_IMPLEMENTATIONS`, which uses a richer `(draft, ctx, opts)` signature).

### Active static rules

In order: `lex_source_grounding` (top of prompt — strong grounding instruction; no scanFunction; companion to `fact_check_unsupported_claims`), `fact_check_unsupported_claims` (scan-only via async path; no prompt text), `lex_word_choices`, `phrase_engagement_beg`, `phrase_ai_tells`, `struct_no_accordion`, `struct_no_sandwich`, `struct_no_decorative_emojis`, `struct_no_bullet_substitutes`, `struct_em_dash`, `struct_no_caps`, `struct_no_first_word_i`, `struct_no_rhetorical_open`, `struct_hashtag_count`, `struct_no_url_in_body`, `struct_antithesis`, `struct_tricolon`, `struct_sentence_cv`, `struct_paragraph_uniform`, `struct_specificity`, `struct_emoji_count`, `struct_markdown_leak`, `struct_char_count`, `struct_template_repeat`, `struct_contraction_rate`, `struct_numbered_list`. Plus dynamic user-derived rules (`user_banned_words`, `user_notes`) prepended by `getActiveQualityRules(ctx)` when banned words / user notes are populated.

### Prompt-builder helpers

- `buildGroundingPromptSection()` — returns the verbose SOURCE GROUNDING block from `lex_source_grounding`. Injected immediately after `expertFrame` in `buildGenerationPrompts` (above user overrides because fabrication is not user-overridable).
- `buildUserOverridesPromptSection(ctx)` — renders the user-derived rules under `USER PREFERENCES (HARD RULES, NO EXCEPTIONS):`.
- `buildBlocklistPromptSection(ctx)` — renders word-choice + structural rules under `STRUCTURAL RULES:`. Excludes `lex_source_grounding` (rendered standalone) and `fact_check_unsupported_claims` (no prompt text).

The system prompt order in `src/lib/ai/generate-draft.ts:buildGenerationPrompts`:

```
expertFrame → groundingBlock → userOverridesBlock → voiceSection → emojiRuleBlock
→ legacyCategorical → structuralRequirements → structureBlock → contrastiveBlock
→ memoriesBlock → rulesBlock → strictRules (3000-char cap only) → aiTellBlocklist
```

The legacy `strictRules` factuality bullets ("Every factual claim must come directly from the provided source article" / "Do not invent statistics, quotes, or company names") were removed in Session 2 — superseded by the standalone grounding block.

---

## Post-Generation Scan Architecture

`runQualityScan` in `src/lib/ai/quality-scan.ts` is the synchronous deterministic scan. It iterates `getActiveQualityRules(ctx)`, dispatches each rule id to its implementation in `SCAN_IMPLEMENTATIONS`, and produces a `QualityScanResult` with `flags: ScanFlag[]` plus structural metadata (sentence-CV, broetry %, hashtag count, etc.) for legacy inbox UI fields.

Two synchronous auto-actions run before the rule loop:
1. **Markdown stripping** (`stripMarkdown`) — removes `**bold**`, `*italic*`, headings, backtick code; emits an info-severity `struct_markdown_leak` flag if any change.
2. **Engagement-beg paragraph removal** (`stripEngagementBegParagraph`) — gated by `tellFlagEngagementBeg`. Strips the matched paragraph from the draft text; emits a `phrase_engagement_beg` flag with action `regenerate` (callers may attempt one more generation).

The Haiku-based `AI_TELL_SCAN_PROMPT` from before Session 1 was deleted: it duplicated deterministic checks. Sessions 2 added back **exactly one** Haiku call for a job the deterministic code genuinely cannot do — claim-to-source verification — wired through a separate async path (`applyFactCheck`) rather than into the synchronous registry.

### Async fact-check layer

`src/lib/ai/scan-draft.ts` exposes:

- `scanDraftForAITells(draftText, ctx, opts)` — sync wrapper around `runQualityScan`; returns the public `ScanResult` shape.
- `applyFactCheck(scanResult, sourceItem, permittedClaims)` — async; calls `verifyFactualClaims` and merges any flag into the existing `ScanResult`.
- `runFactCheckOrSkip(scanResult, sourceItem, contextLabel, permittedClaims)` — convenience wrapper that logs `[fact-check] verifier skipped (label): no source available` when title/url/content are missing, otherwise calls `applyFactCheck`.

### Generation flows wired

Post-generation scan + async fact-check run at **all 7 generation flows** (4 of which also rerun on the engagement-beg rescan):

1. `src/lib/pipeline/generate.ts:runPerUserTavilyFlowForUser` — Phase 2 daily cron path.
2. `src/lib/pipeline/generate.ts:runGeneratePipelineForUser` (legacy global-pool branch) — Phase 1 daily cron path.
3. `src/app/api/drafts/generate-one/route.ts` — manual single-draft generation.
4. `src/app/api/drafts/generate-quick/route.ts` — 3/day quick generate.
5. `src/app/api/drafts/[id]/regenerate/route.ts` — user-instructed regenerate.
6. `src/app/api/drafts/[id]/personalize/route.ts` — Add personal angle (passes `selectedComponent` as `permittedClaims`).
7. `src/app/api/projects/[id]/generate/route.ts` — project-scoped draft.

Flags persist to `draft_queue.ai_tell_flags` as JSON via `serializeAiTellFlags(scanResult)` or `buildAiTellFlagsJson(scanResult, voiceFlags)`. The inbox `DraftCard` parses this and renders warning-severity flags in an amber banner; info flags render under the char-count footer. The fact-check flag has its own multi-line render path so each unsupported claim sits on its own line under a "Possible unsupported claims found" heading.

---

## Daily Generation Pipeline

`runGeneratePipelineForUser` in `src/lib/pipeline/generate.ts` is the entry point. It dispatches on `user_settings.daily_research_mode`:

- **`'global_pool'`** (default; legacy Phase 1 path) — uses a global `research_items` pool seeded by the daily research cron, ranked via Haiku judge.
- **`'per_user_tavily'`** (Phase 2; opt-in) — fetches Tavily live per active topic for this user, no Haiku judge.

Both paths share the Phase 0 prelude:

1. **Settings + access check.** Loads `user_settings`. Returns `skipped: true, reason: <kind>` for missing settings, `cadence_mode = 'on_demand'`, `pending_limit_reached`, or `no_access`. The `no_access` check calls `getSubscriptionStatus` and short-circuits if `!canGenerate` — beta users pass via the beta-first branch.

### `global_pool` path (legacy / default)

2. **Candidate selection.** `research_items` filtered by `published_at > now() - interval '72 hours'`, excluding items already drafted by this user, ordered by `coalesce(relevance_score, 0) + coalesce(originality_score, 0) DESC`, limit 30. NULL `published_at` rows are excluded by `gt()` semantics.
3. **Haiku judge.** Single batched call to `judgeResearchForUser` (`src/lib/ai/judge-research.ts`): `claude-haiku-4-5-20251001`, temperature 0.2, `JUDGE_TIMEOUT_MS = 30000` enforced via `AbortController`. Scores each candidate 0-1 against the user's active `topic_subscriptions`, returns `matched_topic_id` (or null), one-sentence reason. Defensive parsing strips fences, clamps relevance, drops verdicts with unknown ids.
4. **Threshold + priority ranking.** `rankJudgedCandidates` discards verdicts with raw relevance below `JUDGE_RELEVANCE_THRESHOLD = 0.4`, applies `getPriorityMultiplier(topic_subscriptions.priority_weight)` (1=0.6, 2=0.8, 3=1.0, 4=1.2, 5=1.5) → `final_score = relevance × multiplier`. Sort desc.
5. **Fallback.** On judge timeout, parse failure, or any SDK error, falls back to deterministic global `(relevance + originality)` order across the same recency-filtered pool. Records `judgeUsed: false` and `judgeFallbackReason` in the per-user log. Threshold is **not** applied in fallback mode.
6. **Drafting.** Top `user_settings.drafts_per_day` (default 3) selected; `buildVoicePromptSlice(voiceProfile)` feeds `generateDraft`. Sets `draft.topic_subscription_id` and `draft.topic_label` from the judge's `matched_topic_id`.

### `per_user_tavily` path (Phase 2 opt-in)

2. **Per-topic Tavily.** For each active `topic_subscriptions` row, calls `fetchTavily({ query: topic.tavily_query, maxResults: 5, timeRangeDays: 3 })` in parallel. Each topic's status writes back to `topic_subscriptions.last_research_fetch_at` / `last_research_fetch_status` (`'success' | 'no_results' | 'tavily_error'`). Tavily relevance is by construction — **no Haiku judge**.
3. **Persist + augment.** Each Tavily hit upserts into `research_items` (so `draft_queue.research_item_id` FK resolves). RSS items from the user's `source_urls` are mixed in.
4. **Compound priority ranking.** `rankPerUserCandidates` scores each candidate by `originality × user_topic_multiplier × project_multiplier`. Project multipliers are looked up once per unique source topic via `computeProjectMultiplier`. Top N selected.
5. **Drafting.** Same `generateDraft` path as `global_pool`. Topic label comes from the source `topic_subscriptions` row directly (no judge needed).

### Shared post-generation steps (both paths)

7. **Sync scan.** `scanDraftForAITells(generated.draftText, scanContext, opts)` — deterministic flags, markdown strip, engagement-beg auto-action.
8. **Async fact-check.** `runFactCheckOrSkip(scanResult, sourceItem, contextLabel)` — Haiku verifier (see Fact-Check Verifier section). Telemetry aggregated into `result.factCheck`.
9. **Engagement-beg rescan.** If the sync scan stripped a beg paragraph, the route attempts one regeneration with a no-engagement instruction; the rescan path also runs the fact-check verifier.
10. **Per-user cron observability.** End of run writes a `cron_runs` row with `phase = 'generate'` and `result = { userId, draftsGenerated, skipped, reason?, candidatesConsidered, candidatesPassingThreshold, judgeUsed, judgeDurationMs, judgeFallbackReason, mode?, perTopicResults?, rssPoolSize?, selectedMultipliers?, factCheck: { attempted, succeeded, unsupportedClaimCount, durationMs } }`. Updates `user_settings.last_cron_status` to `'success_with_drafts'` or `'success_no_drafts'` (NOT updated for skip cases) and `last_cron_at` to now.

### Phase 2 rollout state

`per_user_tavily` is currently enabled for `chittimooriadarsh@gmail.com` and the friend account; all other users remain on `global_pool`. Toggle via `npx tsx scripts/research-mode.mts <email> <mode>`. Rollout decision pending observation of fact-check telemetry and per-topic outcome distribution. Once `per_user_tavily` is the default and both branches converge, the legacy `global_pool` path and the Haiku judge will be removed.

The legacy `matchTopicSubscriptionForResearchItem` function in `generate.ts` is kept exported for `/api/drafts/generate-quick`, which still uses keyword overlap to label its single Tavily-fetched item.

The inbox empty-state UI (`src/app/inbox/inbox-client.tsx`) reads `lastCronStatus` and `lastCronAt` via `GET /api/drafts` and shows alternate copy when the last run finished within 24h with `'success_no_drafts'`.

---

## Fact-Check Verifier

Work stream 1 Phase 1 (Session 2). The verifier is the only Haiku call in the post-generation scan path; all other rules are deterministic.

### Prompt-side rule

`lex_source_grounding` (in `quality-rules.ts`) — verbose `SOURCE GROUNDING (HARD RULE, NO EXCEPTIONS)` block at the top of every system prompt. Lists the categories of specific claim that must come from the source (numbers, dates, quotes, attributions, named entities, causal claims, first-person research claims) and instructs the model to write around missing data ("a small fraction" instead of "23%") rather than invent. Top-priority position; not user-overridable.

### Scan-side rule

`fact_check_unsupported_claims` (metadata only — `scanFunction: undefined`, prompt instructions empty). The actual verification runs via `verifyFactualClaims` in `src/lib/ai/fact-check.ts`:

- **Model:** `claude-haiku-4-5-20251001`, temperature 0.1, max_tokens 1024.
- **Timeout:** 15s via `AbortController`.
- **Source content:** Tavily summary (max 500 chars) — the prompt explicitly notes the snippet limitation and biases the verifier toward precision over recall ("when uncertain, do not flag").
- **Permitted claims layer:** optional `permittedClaims: string | null` parameter. When set (currently only by the personalize route, passing the selected component), the prompt gains a "permitted personal context" section instructing the model to treat matching first-person claims as supported. Other claim kinds (numbers, dates, named entities, attributions) remain verified against the source only.
- **Output:** JSON `{ unsupported_claims: [{ claim, kind, source_says }] }`. Markdown fences are stripped before parsing.
- **Fail-open:** any error path (timeout, malformed JSON, SDK throw, missing source) returns `{ attempted, succeeded: false, flag: null }`. The verifier never blocks generation.
- **Flag shape:** when claims are unsupported, returns a `ScanFlag` with `ruleId: 'fact_check_unsupported_claims'`, severity `warning`, action `flag`, and a pipe-separated `details` string (`Claim: 'X'. Source says: not in source. | Claim: '...'`).

### Cost

~1,725 input tokens + ~80 output tokens per draft → **~$0.0021 per draft** at current Haiku 4.5 pricing ($1/MTok input, $5/MTok output). Telemetry for real-world numbers lives in `cron_runs.result.factCheck.durationMs` and `unsupportedClaimCount`.

### Inbox UI

`DraftCard.tsx` renders the fact-check flag inside the existing amber `Quality scan` banner via a dedicated `FactCheckFlagBody` subcomponent: a "Possible unsupported claims found" heading, then "These specific claims may not be supported by the source. Review and edit if needed.", then each claim on its own line. Other warning flags continue to use the inline single-line render.

---

## Personal Context Extraction & Selection

Work stream 2 Phase 1 (Session 2). Replaces the prior "dump all of `personal_context` into the system prompt on Add personal angle" behavior with a structured extract-on-save + select-on-personalize pattern.

### Schema

- `voice_profiles.personal_context text` — freeform background description, max **1500** chars (bumped from 500 in Session 2). Edited via the `Personal context` textarea in `/settings`.
- `voice_profiles.personal_context_components jsonb default '[]'` — array of strings, one per discrete experiential component. Currently consumed only by the personalize route. Migration `0010_personal_context_components.sql`.

### Extract on save

`src/lib/ai/extract-personal-context.ts:extractPersonalContextComponents(rawText)`:
- Haiku 4.5, temperature 0.1, 15s timeout.
- Prompt asks for falsifiable, specific, standalone components in the user's voice; explicitly returns `{ components: [] }` for vague inputs rather than forcing extraction.
- **Fail-open** — any error path returns `{ components: [] }` so the raw text save is never blocked. (Diverges from `extract-voice.ts`, which throws on bad JSON because sample-post extraction gates the entire calibration loop.)

`PUT /api/voice` calls the extractor synchronously **only when `personalContext` actually changed** vs. the existing row (the `findFirst` already loaded the prior value). Saves that touch only sample posts or banned words skip the Haiku call.

`POST /api/voice/extract-personal-context` runs extraction on the currently-saved value without a fresh PUT — backs the "Re-extract components" settings button.

### Select on personalize

`src/lib/ai/select-personal-context.ts:selectPersonalContextForDraft(draftText, components)`:
- Haiku 4.5, temperature 0.2, max_tokens 200, 10s timeout.
- Prompt asks for the single most-relevant component, explicitly preferring null over a strained connection.
- Returns `{ selectedIndex: number | null, rationale: string | null }`. Out-of-range numbers are clamped to null.
- **Fail-open** — any error returns `{ selectedIndex: null, rationale: null }`.

The personalize route branches on three modes:
- **`targeted`** — a component fits; render a tight `PERSONAL ANGLE TO WEAVE IN` block referencing only that one experience, with explicit "do not extrapolate beyond it" guard. Pass the component to the fact-check verifier as `permittedClaims` so the matching first-person claim isn't false-positive flagged.
- **`no_fit`** — components exist but none match; fall back to the legacy raw-context prompt (still personalizes for tone). Inbox UI shows "No personal experience fit this topic. Personalized for tone."
- **`legacy_raw_context`** — no components extracted yet but raw text populated; behaves exactly like the pre-Session-2 implementation. Inbox UI shows "Personalized for tone. Add more specific experiences in settings to enable targeted personalization."

`POST /api/drafts/[id]/personalize` returns **400 `code: NO_PERSONAL_CONTEXT`** when both `personal_context` and `personal_context_components` are empty. The `DraftCard` button is gated upstream — when both are empty, the "Add personal angle" button is replaced with a settings link CTA so users normally don't reach the 400 path. Hard-error rather than silent fallback is intentional: silent personalization without personal data would mislead the user about what the feature is doing.

### Settings UI

`/settings` Personal context block (`src/app/settings/settings-client.tsx`):
- Textarea (5 rows, 1500 max) with helper text pushing toward specific, falsifiable experiences over generic bio length.
- Inline "Re-extract components" button (disabled when textarea empty or extracting).
- Read-only chip list below the textarea showing extracted components (max 60 chars per chip with title tooltip for the full text). Chips are derived data — to change them, the user edits the source text and re-extracts.

### Backfill

`scripts/backfill-personal-context-components.mts` — one-shot iteration over voice profiles where `personal_context` is non-empty and `personal_context_components` is empty. Idempotent (only fills empty rows). Run after migration 0010 applies to seed components for users with prior `personal_context` content.

---

## Banned Words Editor

`/settings` voice section. Chip-based add/remove (one chip per banned word). Optimistic UI: clicking remove updates the local state immediately and PATCHes `/api/voice/overrides`; on failure the chip is reinstated and an error toast surfaces. The sanitiser was relaxed in Session 1 to permit any non-injection character (em dashes, arrows, emoji), enabling users to ban literal characters as well as words.

Sanitisation lives in `src/lib/sanitise.ts:sanitiseBannedWords` — strips HTML and prompt-injection patterns but no longer rejects punctuation/symbols. The corresponding scan logic in `quality-scan.ts:user_banned_words` falls back to substring matching for entries that contain non-word chars (since `\b` regex anchors don't apply).

Inflection matching is **not** implemented: banning "leverage" does not match "leveraging". Documented behavior; deferred.

---

## Operator Scripts

Run via `npx tsx scripts/<name>.mts`. None are in the test suite; none are imported by app code. All load `.env.local` via dotenv at the top.

| Script | Purpose |
|---|---|
| `scripts/run-cron-for-user.mts <userId>` | Invokes `runGeneratePipelineForUser` end-to-end against the live DB. Same code path as the Trigger.dev daily schedule. |
| `scripts/probe-judge.mts <userId>` | Calls the Haiku judge in isolation against the user's recency-filtered candidate pool with a 60s timeout; prints per-candidate verdicts and the priority-adjusted ranking. Doesn't write any drafts. |
| `scripts/grant-beta-access.mts <email> <days>` | Upserts `user_settings`, sets `beta_access_until = now() + days`. Service-role auth via `SUPABASE_SERVICE_ROLE_KEY`. |
| `scripts/verify-beta-gate.mts` | Prints `getSubscriptionStatus` for every auth user; temporarily expires beta on `chittimooriadarsh@gmail.com`, runs the cron, asserts the no_access skip writes the right `cron_runs` row, then restores the original `beta_access_until`. |
| `scripts/research-mode.mts <email> <mode>` | Phase 2 rollout flag-flip: looks up auth user by email, sets `user_settings.daily_research_mode` to `'global_pool'` or `'per_user_tavily'`. Will be deleted once `per_user_tavily` is the default. |
| `scripts/backfill-personal-context-components.mts` | One-shot backfill for migration 0010. Iterates rows where `personal_context` is non-empty and `personal_context_components` is empty; runs `extractPersonalContextComponents` per row and persists. Idempotent. |

---

## Tests

Vitest 4. Config: `vitest.config.mts` (root). Setup: `tests/setup.ts` (sets stub env vars).

**218 tests across 17 test files.** Suite runs in <5s on a clean machine (~700ms test execution; the rest is setup + transform). Files:

| File | Coverage |
|---|---|
| `tests/voice-slice.test.ts` | Snapshot of `buildVoicePromptSlice` output. |
| `tests/judge-research.test.ts` | Phase 1 daily judge: happy path, fence stripping, relevance clamping, unknown-id drops, all four fallback paths (SDK throw, non-JSON, missing array, abort timeout), threshold constant. |
| `tests/rank-judged-candidates.test.ts` | Threshold cut-off, priority multiplier, fallback path returns global score order. |
| `tests/rank-research.test.ts` | `PRIORITY_MULTIPLIERS` math + `getPriorityAdjustedScore` edge cases. |
| `tests/rank-per-user-candidates.test.ts` | Phase 2 compound multiplier ranking (originality × user_topic × project). |
| `tests/tavily.test.ts` | Tavily client mapping, dedup hash, news-first / general-fallback behavior. |
| `tests/sanitise.test.ts` | Sanitisation: HTML strip, prompt-injection strip, length limits, banned-word relaxation. |
| `tests/banned-words-helpers.test.ts` | Banned-words helpers + sanitiser integration. |
| `tests/quality-rules.test.ts` | `getActiveQualityRules` composition, `pickPromptInstruction` strict/default selection, `buildBlocklistPromptSection` structure. |
| `tests/quality-scan.test.ts` | `runQualityScan` deterministic behavior + structural fields. |
| `tests/quality/scan-fixtures.test.ts` | Hand-authored fixture-driven regression eval. Includes 2 fact-check fixtures (`fact_check_invented_number`, `fact_check_invented_first_person`) that exercise `applyFactCheck` with a mocked Anthropic SDK. |
| `tests/scan-draft-serialize.test.ts` | `serializeAiTellFlags` / `buildAiTellFlagsJson` JSON shape stability. |
| `tests/generate-draft-prompt.test.ts` | Prompt-builder snapshot tests including grounding-block position assertion (after `expertFrame`, before user overrides + voice). |
| `tests/fact-check.test.ts` | 18 tests: source skipping, all-supported, unsupported with details, markdown fence stripping, malformed JSON, SDK throw, AbortError-as-timeout, non-text content; plus the `permittedClaims` cohort (matching first-person accepted, unrelated fabrication still flagged, prompt section presence/absence). |
| `tests/extract-personal-context.test.ts` | 12 tests for `extractPersonalContextComponents` — empty/whitespace, valid extraction, fence stripping, vague-text empty array, malformed JSON, SDK throw, AbortError, non-string filter. |
| `tests/select-personal-context.test.ts` | 9 tests for `selectPersonalContextForDraft` — empty list, valid selection, null on no fit, malformed JSON, SDK throw, out-of-range clamp to null. |
| `tests/personalize-prompt.test.ts` | 4 tests asserting the `PERSONAL ANGLE TO WEAVE IN` block heading constant + inline snapshot of the rendered block. |

**No DB integration tests.** Operator scripts above are the manual integration check.

---

## Design Tokens

From `onboarding/page.tsx`, `signup/page.tsx`, `login/page.tsx`, and shared patterns:

Key values used everywhere:

- **Background:** `bg-[#F7F7F7]`
- **Card:** `bg-white border border-[#E5E7EB] rounded-xl shadow-[0_1px_3px_0_rgb(0_0_0/0.07)]` (signup/onboarding; login uses `max-w-sm` + similar card)
- **Primary blue:** `#2563EB`
- **Hover blue:** `#1D4ED8` (buttons/links)
- **Heading text:** `text-[#111827]` (often `text-[22px] font-semibold` on onboarding)
- **Secondary text:** `text-[#6B7280]` (`text-[13px]` or `text-[13.5px]`)
- **Border:** `border-[#E5E7EB]`
- **Error:** `text-[#DC2626]` `text-[12px]`
- **Success / positive chips:** e.g. `border-[#BBF7D0] bg-[#F0FDF4] text-[#166534]` (LinkedIn connected on onboarding)
- **Input (representative):** `h-9 w-full rounded-md border border-[#E5E7EB] px-3 text-[13px]` (+ focus ring variants in login/signup)
- **Primary button (representative):** `h-9 rounded-md bg-[#2563EB] px-4 text-[13px] font-medium text-white hover:bg-[#1D4ED8] disabled:opacity-50`
- **Logo:** `bg-[#2563EB]` rounded square with “V”, wordmark `text-[#111827] font-semibold text-[16px]`

---

## Known Issues and Workarounds

- **`/api/auth/signout`** builds redirect with `new URL("/login", process.env.NEXT_PUBLIC_SUPABASE_URL!)` — host becomes Supabase project URL, not the app host. **Likely bug**; verify in production.
- **drizzle-kit / Supabase:** `AGENTS.md` does not mention drizzle-kit; repo contains `drizzle-kit` dependency and migrations. Treat schema workflow as team-defined. Schema-vs-snapshot drift exists from before commit 0006 (`subscriptions` table and several `draft_queue` columns were added without committed migrations); the 0007 and 0008 migrations were trimmed to their actual additions to avoid recreate-on-prod failures, and snapshots are aligned to current state. Pre-existing drift remains untouched — separate cleanup PR.
- **`AGENTS.md`:** Only notes Next.js 15 breaking changes vs training data — instructs to read `node_modules/next/dist/docs/`, but that directory does not exist in this Next install (May 2026). Proceed conservatively on Next-specific work.
- **`CLAUDE.md`:** Only references `@AGENTS.md`.
- **Signup marketing copy vs flow:** `/signup` page text says "Start your 14-day free trial. No card required during setup." In practice the only path to a `'trialing'` `subscriptions` row is the `checkout.session.completed` webhook, which requires entering card details on Stripe's hosted checkout. Beta-access users bypass this entirely. Marketing/code gap, untouched in current PRs.
- **Dead Stripe dependency:** `@stripe/stripe-js ^9.4.0` is in `package.json` but never imported under `src/`. Checkout/portal use server-redirect flows (`window.location.href = data.url`). Safe to remove in a cleanup PR.
- **Beta + Stripe coexistence:** Users with both an active beta and a `'trialing'`/`'active'` Stripe row report `status: 'beta'` from `getSubscriptionStatus` until beta expires. Stripe still bills via webhook → `subscriptions` row updates independently; the gate function just prefers the more permissive beta verdict for `canGenerate`/`canPublish`.
- **Verifier source content is a Tavily snippet (max 500 chars), not the full article.** The verifier prompt is calibrated for precision-over-recall, which means real claims supported only by parts of the article outside the snippet may slip through. Phase 2 of work stream 1 will evaluate whether full-text fetch is worth the latency/cost.

---

## Billing

- **Price:** $10/month (Stripe Price id from `STRIPE_PRICE_ID`).
- **Trial:** 14 days via `trial_period_days: 14` on Checkout `subscription_data`.
- **Statuses returned by `getSubscriptionStatus`:** `'beta'`, `'trialing'`, `'active'`, `'past_due'`, `'canceled'`, `'incomplete'`, `'none'`.
- **`getSubscriptionStatus` (actual code, beta-first):**
  1. Reads `user_settings.beta_access_until`. If non-null and in the future → returns `{ status: 'beta', canGenerate: true, canPublish: true, showPaymentBanner: false, trialEndsAt: null, currentPeriodEnd: null, betaAccessUntil: <Date> }`. Stripe lookup is skipped.
  2. Otherwise reads `subscriptions` row.
     - `canGenerate` / `canPublish`: **true only** for `'trialing'` or `'active'`.
     - `showPaymentBanner`: **true** only for `'past_due'`.
     - No row → `status: 'none'`, both caps false, no banner.
  - Returns `betaAccessUntil` on every code path (null if unset/expired).
- **Effect:** `'past_due'` users **cannot** approve, regenerate, or hit gated generate routes (402). They **can** still load inbox and see banner. Beta users with an existing Stripe row report `'beta'` (more permissive); the Stripe row is left untouched.
- **Webhook events handled:** `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. Signature verification via `stripe.webhooks.constructEvent` with `STRIPE_WEBHOOK_SECRET`. `/api/billing/webhook` is in the middleware `publicPaths` allowlist (no auth gate).
- **Success URL:** `${NEXT_PUBLIC_APP_URL}/inbox`
- **Cancel URL:** `${NEXT_PUBLIC_APP_URL}/settings?billing=canceled`
- **Customer portal:** `POST /api/billing/portal` → JSON `{ url }`; return URL `/settings`.

### Beta Access Layer

Additive layer on top of the Stripe gate. Schema: `user_settings.beta_access_until timestamptz` (nullable). Migration `0008_beta_access_until.sql`.

- **Granting:** `npx tsx scripts/grant-beta-access.mts <email> <days>` — looks up the auth user via `SUPABASE_SERVICE_ROLE_KEY`, upserts `user_settings`, sets `beta_access_until = now() + days`.
- **Current state (2026-05-05):** all 5 auth users granted 1 year of beta (expires 2027-05-03). The Stripe `subscriptions` rows for `kots.aakash@gmail.com` (`'incomplete'`) and `reddynitheesh005@gmail.com` (`'trialing'`) are unaffected; both report `status: 'beta'`.
- **Cron-side enforcement:** `runGeneratePipelineForUser` calls `getSubscriptionStatus` at the top. If `!canGenerate`, writes a `cron_runs` row with `result.skipped: true, result.reason: 'no_access'` and returns without generating. Closes the previously-documented "Paywall vs automation" gap.
- **What's not modified:** Stripe SDK calls, the `subscriptions` table, the webhook handler, the checkout/portal routes. The 5 existing `getSubscriptionStatus` callers (drafts/generate-quick, drafts/generate-one, drafts/[id]/regenerate, drafts/[id]/approve, projects/[id]/generate) get beta-awareness automatically.

---

## LinkedIn API

- **OAuth scope (actual):** `openid profile email w_member_social` (`buildLinkedInAuthorizeUrl` in `src/lib/linkedin/oauth.ts`).
- **API version header (actual):** `LinkedIn-Version: 202510` on `POST /rest/posts` (`src/lib/linkedin/publish.ts`).
- **Publish endpoint:** `POST https://api.linkedin.com/rest/posts` with JSON body: `author` (person URN), `commentary` (text), `visibility`, `distribution`, `lifecycleState: "PUBLISHED"`, etc.
- **Article URL/title:** Passed into `publishToLinkedIn` but **intentionally not sent** (comment in code: reach penalty); `articleUrl` / `articleTitle` are no-ops.
- **Person URN:** From `userinfo` `sub` → `urn:li:person:${sub}`; stored in `linkedin_tokens.person_urn`.
- **Token expiry:** OAuth `expires_in` used when storing token; publish treats HTTP **401** as `TOKEN_EXPIRED`.
- **Image upload / `initializeUpload`:** **Not present** in codebase (text-only publish path).

---

## Cron Schedule

From **`vercel.json` only:**

| Path | Schedule |
|---|---|
| `/api/cron/research` | `0 2 * * *` (daily 02:00 UTC) |

**Note:** `/api/cron/generate` and `/api/cron/publish` are **not** in `vercel.json`; they must be invoked by another scheduler or Trigger.dev / manual process.

---

## What Is Built (current state)

- Supabase session middleware + cookie refresh.
- Email/password login and signup; 5-step onboarding with first-draft generation and Stripe checkout CTA.
- Drizzle models and DB access for drafts, posts, voice, topics, projects, LinkedIn tokens, user settings, cron logs, subscriptions.
- Tavily + RSS research pipeline code paths.
- Draft generation (Sonnet 4.6) with rejection-aware prompting, structure templates, recent-memory injection, voice profile + user overrides + grounding rule baked into the system prompt.
- **Unified `QUALITY_RULES` system** at `src/lib/ai/quality-rules.ts` — single source of truth for prompt rules and scan rule metadata. Static rules + dynamic user-derived rules (banned words, user notes).
- **Deterministic post-generation scan** in `src/lib/ai/quality-scan.ts` — iterates rules, runs `SCAN_IMPLEMENTATIONS`, emits `ScanFlag[]`. Markdown stripping and engagement-beg auto-action are persistent (apply to every draft, every flow). The previous Haiku-based scan was deleted.
- **Async fact-check verifier** (`src/lib/ai/fact-check.ts`) — single Haiku call per draft, fail-open, snippet-aware. `permittedClaims` parameter respects personalization context. Wired through all 7 generation flows + 4 engagement-beg rescan paths.
- **Telemetry:** `cron_runs.result.factCheck` aggregates per-run verifier stats (attempted, succeeded, unsupportedClaimCount, durationMs).
- **Personal context extraction & selection** — `personal_context_components` jsonb column, extract-on-save (only when changed), select-on-personalize, read-only chip list in settings, gated personalize button. 1500-char limit on freeform `personal_context`. Backfill script available.
- **Banned words editor** — chip-based UI with optimistic add/remove and revert-on-failure; sanitiser permits any non-injection character.
- **Phase 2 daily generation** — feature flag `user_settings.daily_research_mode` switches between `global_pool` (legacy + Haiku judge) and `per_user_tavily` (parallel Tavily fetch per topic, no judge). 2 of 5 users on `per_user_tavily`.
- **Per-user cron observability** — `cron_runs` row per user per run; `user_settings.last_cron_status` / `last_cron_at` power inbox empty-state copy.
- **Cron-side access enforcement** — `runGeneratePipelineForUser` short-circuits with `reason: 'no_access'` for users where `!canGenerate`.
- **Beta access layer** — `user_settings.beta_access_until` column, beta-first branch in `getSubscriptionStatus`, admin grant script.
- LinkedIn OAuth + text post publish to `/rest/posts`.
- Stripe Checkout, webhook sync to `subscriptions`, Customer Portal.
- Subscription gating (402) on specific write/generate routes, beta-aware.
- Trigger.dev tasks: daily research, per-user generate schedule, on-demand publish task.
- UI pages: inbox, settings, projects, history, archive, insights, onboarding.
- Vitest test infra: 218 unit tests across 17 files.
- Operator scripts: `run-cron-for-user`, `probe-judge`, `grant-beta-access`, `verify-beta-gate`, `research-mode`, `backfill-personal-context-components`.

---

## Deferred / Not Built

Out of scope for current state. SESSION_LOG.md entries discuss why and when each lands.

- **Voice growing with the user (work stream 3 / feedback loop)** — system learning from approved drafts, edits, rejections. The substrate (`draft_memories`, `regeneration_history`, `rejection_reasons`) exists but no extraction or rule-update path yet. `personal_context_components` shape (`string[]`) will need to evolve into structured entries with usage metadata when this lands.
- **Full GENERATION_QUALITY_PLAN — `edit_events` and `voice_rules` tables.** Planned but not built. Not blocking current functionality.
- **Phase 2 of work stream 1 (factual accuracy):** full source-text fetch for the verifier (currently capped at the 500-char Tavily snippet), confidence scoring on individual flags, evaluation of Sonnet for high-stakes drafts, source quality filtering at fetch time.
- **Phase 2 of work stream 2 (personalization):** evaluate whether to inject `personal_context_components` into daily generation (not just personalize). Schema comment on the column has a TODO marker.
- **Inflection matching for banned words.** "leverage" doesn't match "leveraging" today; documented behavior. If changed, `tests/quality/scan-fixtures.ts:user_banned_word_inflection`'s `mustNotFlag` becomes `mustFlag`.
- **Conversational project creation** — the current `NewProjectWizard` is form-based.
- **Structured goal presets** for projects (currently freeform `goal` text).
- **Dashboard home page** — `/insights` exists as a stub UI; no real charts yet.
- **Stripe enforcement post-beta:** the 5 current users are all on beta until 2027-05-03. The path from beta expiry to Stripe is untested in production.
- **LinkedIn OAuth re-auth flow before 60-day expiry** — `linkedin_tokens.token_expiry` is recorded; no proactive refresh prompt UI. Publish currently fails with `TOKEN_EXPIRED` on 401 and surfaces a banner via `TokenExpiryBanner`.
- **LinkedIn image / rich media upload flow** — text-only publish today.
- **Vercel cron entries for generate/publish** — only research is declared in `vercel.json`. Generate/publish run via Trigger.dev schedules.
- **RLS policies** — not in repo; `subscriptions` table verified to have `user_owns_subscription` policy in Supabase, others unverified.
- **DB integration tests** — no test container or sandbox schema.
- **UI surface for beta status** — `showPaymentBanner` is false for beta users so the inbox banner correctly hides; no positive "you're on beta" affordance.
- **Project-junction priority weighting in the daily cron path** — `series_topic_subscriptions.priority_weight` is read only by `/api/projects/[id]/generate` today; the cron paths don't consult it.

---

## Rules (Non-Negotiable)

1. Official LinkedIn API only — no scraping, no headless browsers, no session cookies
2. Human approval before every post — no auto-posting
3. Voice quality over volume
4. No fake accounts or engagement pods
5. Rejection feedback is sacred — always captured, always used
6. No hallucinated facts in posts
7. User data belongs to the user
8. No fake reviews or endorsements
9. Platform risk always on roadmap — multi-platform planned
10. Every feature has a success metric
11. Personal build is production build — no throwaway code
12. No external users until data isolation verified (RLS: **verify in Supabase**, not in repo)
13. Stale drafts archived not ignored
14. AI tell detection before every post enters inbox
15. All user input fed to LLMs must be sanitised (`src/lib/sanitise.ts` — verify call sites when changing flows)
16. Every Cursor prompt includes exact SQL to run in Supabase *(team process — not enforced by code)*
