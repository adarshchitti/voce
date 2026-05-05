# SESSION_LOG.md — Voce session-by-session record

> Append-only log of substantive work sessions. Each entry captures what
> shipped, what was deferred, and what architectural concerns the work
> introduced. Future Claude Code sessions read this to orient before
> picking up adjacent work.
>
> Distinct from PROJECT_TRUTH.md (which describes the *current* state of
> the codebase) and the per-stream PLAN.md files (which describe upcoming
> *intent*). This file describes *history* and *carried-forward concerns*.

---

## Session 1 — Quality-rules rebuild (ended 2026-05-03)

Recap drawn from git history (no contemporaneous log entry was written).
Range: commits `bf0cae1` (Step 4) through `1ab4515` (chip-based banned
words). The rebuild unified the previously-scattered AI-tell prompt and
scan logic into a single `QUALITY_RULES` source of truth in
`src/lib/ai/quality-rules.ts`, with `runQualityScan` in
`src/lib/ai/quality-scan.ts` iterating that list to produce `ScanFlag[]`.
The Haiku-based scan was deleted because it duplicated deterministic
checks. The inbox amber-banner UI in `DraftCard.tsx` was reworked to
render the new `{flags: [...]}` JSON shape, with a legacy-shape
fallback for drafts persisted before the rebuild. Step 7 added
hand-authored regression fixtures in `tests/quality/scan-fixtures.ts`.

This is the foundation Session 2 builds on top of.

---

## Session 2 — Factual accuracy + targeted personalization (2026-05-04 to 2026-05-05)

### What shipped

**Work stream 1 — Factual accuracy enforcement (Phase 1).** Drafts had
been inventing numbers, fabricating first-person research claims, and
making up specifics. This session shipped the foundation for fact
correction:

- A `lex_source_grounding` rule added to `STATIC_QUALITY_RULES` with a
  verbose SOURCE GROUNDING (HARD RULE) prompt block, positioned
  immediately after `expertFrame` in the system prompt — above user
  overrides because fabrication isn't user-overridable. The two
  pre-existing `strictRules` factuality bullets were deleted; the
  grounding block is the single source of truth.
- A `fact_check_unsupported_claims` rule (scan-only, no prompt text)
  backed by `verifyFactualClaims` in `src/lib/ai/fact-check.ts` — an
  async Haiku 4.5 call (15s timeout, fail-open) that compares each
  draft against its source and reports specific unsupported claims.
  Snippet-aware: the prompt explicitly biases toward precision over
  recall because Tavily summaries are 500-char snippets, not full
  articles.
- `applyFactCheck` and `runFactCheckOrSkip` in `src/lib/ai/scan-draft.ts`
  run the verifier as an async pass after the synchronous quality scan,
  merging any flag into the existing `ScanResult`. Wired into all 7
  generation flows (2 cron pipelines + 5 routes) plus 4 engagement-beg
  rescan paths.
- `GenerateUserResult.factCheck` aggregates per-run telemetry (attempted,
  succeeded, unsupportedClaimCount, durationMs) into `cron_runs.result`.
- `DraftCard.tsx` renders the fact-check flag's pipe-separated `details`
  string back out as a multi-line claim list under the existing amber
  banner — the highest-signal flag in the inbox, branched into its own
  render path.

**Work stream 2 — Targeted personalization (Phase 1).** The
`personal_context` field was a freeform textarea whose entire content
was dumped into the system prompt on "Add personal angle" — diluting
the angle and letting the model extrapolate beyond what the user said.
This session shipped extraction + selective injection:

- Migration `0010_personal_context_components.sql` adds
  `voice_profiles.personal_context_components jsonb default '[]'`.
  `FIELD_LIMITS.personalContext` bumped from 500 to 1500 to support
  the 3-10-component target.
- `src/lib/ai/extract-personal-context.ts` and
  `src/lib/ai/select-personal-context.ts` — Haiku 4.5 helpers, both
  fail-open. Extraction breaks the freeform string into discrete,
  falsifiable experiential components. Selection picks the single
  most-relevant component for a given draft (or null on no fit).
- `PUT /api/voice` re-extracts components synchronously, but only
  when `personalContext` actually changed vs. the existing row.
- `POST /api/voice/extract-personal-context` runs extraction without a
  fresh save — backs the "Re-extract components" settings button.
- The personalize route now branches on three modes: `targeted` (a
  component fits, render a tight `PERSONAL ANGLE TO WEAVE IN` block
  referencing only that one experience), `no_fit` (components exist
  but none match — fall back to the legacy raw-context prompt), and
  `legacy_raw_context` (no components extracted yet but raw text is
  populated). Hard 400 with `code: NO_PERSONAL_CONTEXT` when neither
  field is set; the inbox button is hidden upstream when both are
  empty so users normally don't reach the error path.
- `DraftCard.tsx` accepts a `hasPersonalization` prop, hides/disables
  the button when false, and surfaces a small notice describing what
  was actually used after a successful click.
- Settings UI gained a chip list of extracted components (read-only
  derived data — user edits the source text and re-extracts to change
  them) plus a "Re-extract components" button. Helper text rewritten
  to push toward specifics over length.

**Cross-stream — concern 8 fix.** The two work streams interact: every
successful targeted personalization injects a first-person claim that
the work-stream-1 verifier would then flag as unsupported. The verifier
gained an optional `permittedClaims` parameter; the personalize route
passes the selected component when the targeted-angle path fired so
the matching first-person claim is treated as supported. Other claim
kinds remain verified against the source only.

**Backfill.** `scripts/backfill-personal-context-components.mts`
iterates existing voice profiles where `personal_context` is non-empty
and `personal_context_components` is empty, runs extraction on each,
saves the result. Idempotent. Run after migration 0010 applies and
before announcing the feature.

### Test posture

218 / 218 tests passing on push (up from 184 at the start of the
session). New test files: `tests/fact-check.test.ts` (18 tests),
`tests/extract-personal-context.test.ts` (12 tests),
`tests/select-personal-context.test.ts` (9 tests),
`tests/personalize-prompt.test.ts` (4 tests). Two new fixtures in
`tests/quality/scan-fixtures.ts` (`fact_check_invented_number`,
`fact_check_invented_first_person`); the fixture runner gained an
async path that mocks the Anthropic SDK for the source-aware fixtures.

### Carried-forward concerns

These were surfaced during Session 2 work but explicitly deferred. A
future session picking up adjacent work should read this list before
starting; some of these constrain the design of the next phase. Concern
8 (verifier false-positives on personalized drafts) was fixed in
Session 2 (commit `af90760`) and is omitted here.

#### Concern 1 — `personalContextComponents` is `string[]`, not a structured shape

**Why it's a concern.** The components array is the unit of
personalization. The current shape is a flat list of strings. If a
later phase wants per-component metadata — usage count, last-used-at,
user-disabled flag, source provenance ("from sample post X"), embedding
vector for semantic ranking — the column type forces a migration to
`Array<{ text, ... }>`, plus updates to every reader of the column
(extraction, selection, settings UI chips, backfill script).

**When to address.** When work stream 3 (the broader feedback loop where
the system learns from approved drafts and edits) begins. That work
will almost certainly want to track which components have been used in
approved drafts and which haven't, which forces the structured shape.

**Files affected.** `src/lib/db/schema.ts` (column type),
`src/lib/ai/extract-personal-context.ts` and
`src/lib/ai/select-personal-context.ts` (return shapes),
`src/app/api/voice/route.ts` and
`src/app/api/voice/extract-personal-context/route.ts` (persistence),
`src/app/api/drafts/[id]/personalize/route.ts` (consumption),
`src/app/settings/settings-client.tsx` (chip render),
`scripts/backfill-personal-context-components.mts` (backfill output).

#### Concern 2 — Re-extraction has no de-duplication

**Why it's a concern.** Each re-extraction overwrites the prior list.
If Haiku produces slightly different phrasing on the same input
(temperature 0.1 doesn't guarantee determinism), the user sees their
chip list shift even when their underlying description didn't change.
Mostly cosmetic but could be jarring once users get attached to seeing
a stable list.

**When to address.** If user feedback indicates the churn is
distracting, or when work stream 3 introduces stable component IDs for
usage tracking (which would naturally fix this as a side effect).

**Files affected.** `src/lib/ai/extract-personal-context.ts` (the
extractor), `src/app/api/voice/route.ts` (overwrite logic),
`src/app/api/voice/extract-personal-context/route.ts` (re-extract
endpoint).

**Possible approaches.** (a) Generate a stable id per component and
match incoming components to existing ones by similarity; (b) accept
the churn as the cost of regenerative extraction; (c) only re-extract
on explicit user action and never on automatic save triggers. Phase 1
took (b) implicitly.

#### Concern 3 — No inline editing of extracted components

**Why it's a concern.** Per spec, the chip list is read-only — the user
edits the source text and re-extracts to change components. This is
the right call when extraction is high-quality, but if real-world
extraction is noisy the user can't fix a single bad component without
rewriting their full description. The Phase 1 design forecloses inline
chip editing without a non-trivial UX rework.

**When to address.** If post-deploy verification shows extraction
quality is poor often enough that users complain. Likely co-evolved
with Concern 1's structured shape — once chips have IDs, you can
support "edit this one" without losing the rest.

**Files affected.** `src/app/settings/settings-client.tsx` (chip
component would gain edit state), the persistence endpoints (would
need to accept user-edited components and distinguish them from
extracted ones — relevant to provenance tracking in Concern 1).

#### Concern 4 — Components are extracted only from `personal_context`

**Why it's a concern.** Sample posts (in `voice_profiles.sample_posts`)
also encode personal experience implicitly ("Last week I shipped...",
"In my time at X..."). Those don't feed `personal_context_components`
today. The result is that users with rich sample-post sets but a thin
`personal_context` get shallow personalization for no good reason.

**When to address.** When work stream 3 begins. Extracting components
from approved drafts is the natural next step in that stream and would
generalize to sample-post extraction.

**Files affected.** A new extractor would mirror
`src/lib/ai/extract-personal-context.ts` but consume sample posts.
`src/app/api/voice/route.ts` would call it alongside (or after) the
existing `extractVoicePatterns` step. The component schema would need
to track provenance (Concern 1) so the user sees which chip came from
which source.

#### Concern 5 — Selection returns at most one component

**Why it's a concern.** A draft might genuinely benefit from weaving in
two related experiences ("I shipped X in 2024, building on the Y work
I did in 2022"). The current `selectPersonalContextForDraft` returns
a single index or null. Multi-select would require a prompt rewrite
and the personalize route's `PERSONAL ANGLE TO WEAVE IN` block to
handle a list rather than a single string.

**When to address.** If real-world data shows users frequently editing
a personalized draft to add a second experience. Probably the right
call to defer indefinitely — multi-component injection risks feeling
stuffed and "weave in two experiences" is a fragile prompt. Reconsider
only if there's evidence.

**Files affected.** `src/lib/ai/select-personal-context.ts` (return
type), `src/app/api/drafts/[id]/personalize/route.ts` (instruction
builder), `tests/select-personal-context.test.ts` (covers the existing
single-select contract; would need expansion).

#### Concern 6 — Extract-on-save is synchronous (~3-5s latency on PUT /api/voice)

**Why it's a concern.** When `personalContext` changes, the PUT handler
blocks on a Haiku call before responding. Tolerable for an explicit
"Save voice profile" button click, but if a future phase introduces
autosave or per-field PATCH for `personalContext`, that latency lands
in the user's typing flow. The "only re-extract when value changed"
guard at least prevents this latency on saves that don't touch
`personalContext`.

**When to address.** Before any autosave / debounced-save UX is
introduced. Two fixes available: (a) move extraction to a background
job (Trigger.dev task), accepting eventual consistency for the chip
list and the personalize route; (b) keep it synchronous but make the
user-facing PUT respond optimistically and run extraction
fire-and-forget with the result reconciled on the next GET.

**Files affected.** `src/app/api/voice/route.ts` (the PUT handler is
where the await sits), `src/app/settings/settings-client.tsx` (would
need optimistic UI for the chip list under option b), and possibly a
new `src/trigger/*.ts` task under option a.

#### Concern 7 — `NO_PERSONAL_CONTEXT` 400 forecloses A/B testing tone-only personalization

**Why it's a concern.** The Phase 1 design hard-fails when both
`personalContext` and `personalContextComponents` are empty, and the
inbox button is hidden upstream so users don't reach the error path.
This means we can't experiment with "tone-only personalization for
users without context" — a path that might still produce a meaningfully
better draft than the user's default voice.

**When to address.** Only if there's evidence that tone-only
personalization is worth measuring. Decision is intentional, not an
oversight: silent fallback would mislead users about what the feature
is doing, which was judged to outweigh the A/B-testing flexibility.

**Files affected.** `src/app/api/drafts/[id]/personalize/route.ts`
(the 400 branch would need a feature flag to toggle ↔ soft-fallback),
`src/components/DraftCard.tsx` (the button-gating logic would need to
read the same flag to decide whether to hide the button or let it
through).

---
