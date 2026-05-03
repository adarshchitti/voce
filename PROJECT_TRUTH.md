# PROJECT_TRUTH.md — Voce Ground Truth
> Auto-generated from codebase. Update this file whenever something real changes.
> This is the file other AI sessions read first. Every line must be accurate.
> Last updated: 2026-05-03

---

## What This App Is

Voce is a LinkedIn-focused AI writing assistant: it ingests research (RSS, Tavily, etc.), generates draft posts in a user’s calibrated voice, surfaces them in an inbox with “AI tell” scanning, and schedules human-approved posts for publishing to LinkedIn. The core loop is research → draft generation → user review/approve → scheduled publish via Trigger.dev. Self-serve users sign up with email and password, complete multi-step onboarding (voice, topics, LinkedIn, scheduling, first draft), then may start Stripe billing (14-day trial, $10/mo) before or after using the product depending on flow.

---

## Stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 15 App Router | `next` ^15.5.15 in package.json |
| Hosting | Vercel | `vercel.json` defines crons; hosting not named in repo |
| Database | Supabase (Postgres) | `DATABASE_URL` via `postgres` driver |
| ORM | Drizzle | Schema in `src/lib/db/schema.ts`; runtime queries use `drizzle-orm` + `db` in `src/lib/db/index.ts` |
| Schema changes | Migrations + raw SQL | `src/lib/db/migrations/*.sql` and `drizzle.config.ts` exist; project docs warn against drizzle-kit on Supabase constraints — verify team process |
| Auth | Supabase Auth | **Email + password** in browser: `signInWithPassword` (login), `signUp` (signup). No magic link in UI. `/api/auth/login` POST is **disabled** (410). |
| Background jobs | Trigger.dev | `@trigger.dev/sdk` **4.4.5** in package.json; task files import `@trigger.dev/sdk/v3`. `trigger.config.ts` project id: `proj_gutapfjoxgjzsbxyfgmi` |
| Research (HTTP) | Vercel Cron | `vercel.json`: **only** `GET/POST /api/cron/research` at `0 2 * * *` |
| Research (Trigger) | Trigger.dev schedule | `researchTask` in `src/trigger/research.ts` uses cron `0 2 * * *` |
| Generate / publish crons | Next.js API routes | `/api/cron/generate`, `/api/cron/publish` exist with `CRON_SECRET` bearer check; **not** listed in `vercel.json` — must be scheduled externally or manually |
| LLM | Anthropic API | Primary draft: `claude-sonnet-4-6` (`generate-draft.ts`). Haiku `claude-haiku-4-5-20251001` used in scan, score, extract, suggest-query, approve helpers, project scoring |
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
  ai/           # generate-draft, extract-voice, scan-draft, score-*, prompts, rank-research, ai-tells
  db/           # index.ts, schema.ts, migrations/
  linkedin/     # oauth.ts, publish.ts
  pipeline/     # generate.ts, publish.ts, research.ts
  research/     # tavily.ts, rss.ts
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
| `topic_subscriptions` | User topics + Tavily query | `user_id`, `topic_label`, `tavily_query`, `active` | No |
| `content_series` | Projects / series | `user_id`, `title`, `goal`, `project_topics`, `auto_generate` | No |
| `series_topic_subscriptions` | Project ↔ topic link | `series_id`, `topic_subscription_id` | No |
| `draft_queue` | Generated drafts | `user_id`, `draft_text`, `status`, `stale_after`, `series_id`, `ai_tell_flags`, `topic_subscription_id`, `topic_label`, `source` (`'cron'` \| `'quick_generate'` \| `'onboarding'`) | No |
| `regeneration_history` | Regeneration audit | `user_id`, `draft_id`, instruction, before/after text | No |
| `rejection_reasons` | Rejection taxonomy + free text | `user_id`, `draft_id`, `reason_code`, `rejection_type` | No |
| `posts` | Scheduled/published posts | `user_id`, `draft_id`, `scheduled_at`, `status`, `linkedin_post_id` | No |
| `voice_profiles` | Voice calibration + overrides | `user_id` unique, `sample_posts`, stylometric fields, `generation_guidance` | No |
| `draft_memories` | Approved-draft memory | `user_id`, `approved`, `structure_used`, edit stats | No |
| `linkedin_tokens` | LinkedIn OAuth tokens | `user_id` unique, `access_token`, `person_urn`, `token_expiry`, `status` | No |
| `user_settings` | Cadence, tell flags, onboarding, per-user cron observability, beta access | `user_id` PK, `preferred_days`, `onboarding_completed`, tell flags, `last_cron_status`, `last_cron_at`, `beta_access_until` | No |
| `cron_runs` | Cron run logs | `phase`, `ran_at`, `result`, `success` | No |
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
- **POST** `/api/drafts/[id]/personalize` — Personalize draft.
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
- **GET** `/api/voice` — Voice profile.
- **PUT** `/api/voice` — Update voice / sample posts.
- **POST** `/api/voice/extract` — Run extraction.
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
| `generate.ts` | `generate-drafts` | `schedules.task` | Payload schedule: `externalId` = `userId`. Archives stale pending drafts, runs `runGeneratePipelineForUser` (which gates on `getSubscriptionStatus`, runs the Haiku judge, applies priority weights, and writes a per-user `cron_runs` row + updates `user_settings.last_cron_status` / `last_cron_at`). Max 300s. |
| `research.ts` | `daily-research` | `schedules.task` | Cron `0 2 * * *`. Runs `runResearchPipeline`, `logResearchRun`. Max 600s. |
| `scheduleUserGenerate.ts` | `schedule-user-generate` | `schemaTask` | Creates/deletes Trigger schedule for `generate-drafts` per user timezone/cadence; `on_demand` deletes schedule. |

---

## Daily Generation Pipeline

`runGeneratePipelineForUser` in `src/lib/pipeline/generate.ts` is the single per-user code path called by both the legacy `runGenerateForDueUsers` cron and the per-user Trigger.dev `generate-drafts` schedule. Step-by-step:

1. **Settings + access check.** Loads `user_settings`. Returns `skipped: true, reason: <kind>` for missing settings, `cadence_mode = 'on_demand'`, `pending_limit_reached`, or `no_access`. The `no_access` check calls `getSubscriptionStatus` and short-circuits if `!canGenerate` — beta users pass via the beta-first branch.
2. **Candidate selection.** `research_items` filtered by `published_at > now() - interval '72 hours'`, excluding items already drafted by this user, ordered by `coalesce(relevance_score, 0) + coalesce(originality_score, 0) DESC`, limit 30. NULL `published_at` rows are excluded by `gt()` semantics — currently this eliminates all `tavily_search` items from the daily pool.
3. **Haiku judge.** Single batched call to `judgeResearchForUser` (`src/lib/ai/judge-research.ts`): `claude-haiku-4-5-20251001`, temperature 0.2, `JUDGE_TIMEOUT_MS = 30000` enforced via `AbortController`. Scores each candidate 0-1 against the user's active `topic_subscriptions`, returns `matched_topic_id` (or null), one-sentence reason. Defensive parsing: strips ```` ```json ```` fences, clamps relevance into [0, 1], drops verdicts with unknown `research_item_id`, nullifies unknown `matched_topic_id`.
4. **Threshold + priority ranking.** `rankJudgedCandidates` discards verdicts with raw relevance below `JUDGE_RELEVANCE_THRESHOLD = 0.4`, applies `getPriorityMultiplier(topic_subscriptions.priority_weight)` from `src/lib/ai/rank-research.ts` (1=0.6, 2=0.8, 3=1.0, 4=1.2, 5=1.5) → `final_score = relevance × multiplier`. Sort desc.
5. **Fallback.** On judge timeout, parse failure, or any SDK error, falls back to deterministic global `(relevance + originality)` order across the same recency-filtered pool. Records `judgeUsed: false` and `judgeFallbackReason` in the per-user log. Threshold is **not** applied in fallback mode (global scores aren't directly comparable to judge relevance).
6. **Drafting.** Top `user_settings.drafts_per_day` (default 3) selected. `buildVoicePromptSlice(voiceProfile)` — shared 16-field helper used by both this path and `/api/drafts/generate-quick` — feeds `generateDraft`. Sets `draft.topic_subscription_id` and `draft.topic_label` from the judge's `matched_topic_id` (no longer keyword-overlap).
7. **Per-user cron observability.** End of run writes a `cron_runs` row with `phase = 'generate'` and `result = { userId, draftsGenerated, skipped, reason?, candidatesConsidered, candidatesPassingThreshold, judgeUsed, judgeDurationMs, judgeFallbackReason }`. Updates `user_settings.last_cron_status` to `'success_with_drafts'` or `'success_no_drafts'` (NOT updated for skip cases) and `last_cron_at` to now.

The legacy `matchTopicSubscriptionForResearchItem` function in `generate.ts` is kept exported for `/api/drafts/generate-quick`, which still uses keyword overlap to label its single Tavily-fetched item. The cron path no longer calls it.

The inbox empty-state UI (`src/app/inbox/inbox-client.tsx`) reads `lastCronStatus` and `lastCronAt` via `GET /api/drafts` and shows a different copy when the last run finished within 24h with `'success_no_drafts'` ("Nothing in today's research closely matched your topics. We'll keep looking tomorrow. To generate a draft on a specific topic right now, use Quick Generate above.") — the Quick Generate input is on the same page.

---

## Operator Scripts

Run via `npx tsx scripts/<name>.mts`. None are in the test suite; none are imported by app code. All load `.env.local` via dotenv at the top.

| Script | Purpose |
|---|---|
| `scripts/run-cron-for-user.mts <userId>` | Invokes `runGeneratePipelineForUser` end-to-end against the live DB. Same code path as the Trigger.dev daily schedule. |
| `scripts/probe-judge.mts <userId>` | Calls the Haiku judge in isolation against the user's recency-filtered candidate pool with a 60s timeout; prints per-candidate verdicts and the priority-adjusted ranking. Doesn't write any drafts. |
| `scripts/grant-beta-access.mts <email> <days>` | Upserts `user_settings`, sets `beta_access_until = now() + days`. Service-role auth via `SUPABASE_SERVICE_ROLE_KEY`. |
| `scripts/verify-beta-gate.mts` | Prints `getSubscriptionStatus` for every auth user; temporarily expires beta on `chittimooriadarsh@gmail.com`, runs the cron, asserts the no_access skip writes the right `cron_runs` row, then restores the original `beta_access_until`. |

---

## Tests

Vitest 4. Config: `vitest.config.mts` (root). Setup: `tests/setup.ts` (sets stub env vars). Currently 32 tests across 4 files in `tests/`:

| File | Coverage |
|---|---|
| `tests/voice-slice.test.ts` | Snapshot of `buildVoicePromptSlice` output — regression guard for the quick-generate refactor. |
| `tests/judge-research.test.ts` | Happy path, fence stripping, relevance clamping, unknown research-item-id drops, unknown matched-topic-id nullify, all four fallback paths (SDK throw, non-JSON, missing array, abort timeout), empty-input short-circuit, threshold constant. |
| `tests/rank-judged-candidates.test.ts` | Threshold cut-off (raw relevance, not adjusted), priority 5 vs 1 invariant at equal relevance, fallback path returns global score order, unknown topic id falls back to multiplier 1.0. |
| `tests/rank-research.test.ts` | `PRIORITY_MULTIPLIERS` math + `getPriorityAdjustedScore` edge cases. |

**No DB integration tests.** The project has no test container or sandbox-schema setup; stubbing Drizzle's chained query builder is fragile. The operator scripts above are the manual integration check.

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
- **Current state (2026-05-03):** all 5 auth users granted 1 year of beta (expires 2027-05-03). The Stripe `subscriptions` rows for `kots.aakash@gmail.com` (`'incomplete'`) and `reddynitheesh005@gmail.com` (`'trialing'`) are unaffected; both report `status: 'beta'`.
- **Cron-side enforcement:** `runGeneratePipelineForUser` calls `getSubscriptionStatus` at the top. If `!canGenerate`, writes a `cron_runs` row with `result.skipped: true, result.reason: 'no_access'` and returns without generating. (This closes the gap previously documented as "Paywall vs automation" in Known Issues.)
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

## What Is and Is Not Built

### Built and verified in code

- Supabase session middleware + cookie refresh
- Email/password login and signup (client-side Supabase); onboarding with draft generation and Stripe checkout CTA on last step
- Drizzle models and DB access for drafts, posts, voice, topics, projects, LinkedIn tokens, user settings, cron logs, subscriptions
- Tavily + RSS research pipeline code paths
- Draft generation (Claude), AI tell scan, voice scoring, regeneration, personalization, rejection reasons
- LinkedIn OAuth and text post publish to `/rest/posts`
- Stripe Checkout, webhook sync to `subscriptions`, Customer Portal
- Subscription gating (402) on specific write/generate routes — now beta-aware via the beta-first branch in `getSubscriptionStatus`
- Trigger.dev tasks: daily research, per-user generate schedule, on-demand publish task
- UI pages: inbox, settings, projects, history, archive, insights, onboarding
- **Daily generation pipeline (Phase 1):** 72h recency filter, 30-candidate pool, Haiku judge step (`judgeResearchForUser`), 0.4 relevance threshold, priority-weighted ranking, deterministic fallback on judge failure, topic label set from judge `matched_topic_id` (no longer keyword overlap)
- **Per-user cron observability:** `cron_runs` row written per user per run with judge stats; `user_settings.last_cron_status` / `last_cron_at` columns power the inbox empty-state messaging
- **Cron-side access enforcement:** `runGeneratePipelineForUser` now calls `getSubscriptionStatus` and skips with `reason: 'no_access'` if `!canGenerate`
- **Beta access layer:** `user_settings.beta_access_until` column, `'beta'` status returned ahead of Stripe, `scripts/grant-beta-access.mts` admin tool
- **Vitest test infra:** 32 unit tests covering voice slice, judge fallback paths, ranking math, threshold logic
- **Operator scripts:** `scripts/{run-cron-for-user, probe-judge, grant-beta-access, verify-beta-gate}.mts`

### Not built or incomplete in repo

- LinkedIn image / rich media upload flow
- Vercel cron entries for generate/publish (only research declared); per-user generation runs through Trigger.dev schedules
- RLS policies (not defined in repo; `subscriptions` table verified to have a `user_owns_subscription` policy in Supabase, others unverified)
- `/api/auth/login` server password login (explicitly disabled)
- DB integration tests (no test container or sandbox schema set up)
- UI surface for beta status (the existing `showPaymentBanner` returns false for beta users so the inbox banner naturally won't show; deliberately deferred)
- Project-junction priority weighting in the daily cron (Phase 2; junction `series_topic_subscriptions.priority_weight` is read only by `/api/projects/[id]/generate` today)

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
