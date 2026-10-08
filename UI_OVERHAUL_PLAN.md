# UI_OVERHAUL_PLAN.md — Voce demo redesign

> Status: plan, not yet implemented. Written 2026-10-05.
> Decisions locked with Adarsh: bold landing + refined app · warm paper + Voce blue ·
> seeded demo spine with one live call · full scope (every screen).
> Reference: a two-direction design canvas ("recruit-me Workprint Redesign"). We adapt
> direction V1 (neo-brutalist / Gumroad-leaning) for the landing and a softened V1 for the app.

---

## 0. Blockers found while checking keys (do these first)

Checked 2026-10-05 against live endpoints.

| Service | Status | Needed for demo |
|---|---|---|
| **Anthropic** | Key **valid**, but `credit balance is too low` — every LLM call 400s | **Yes** — top up, the live-call moment depends on it |
| **Supabase project** | **Gone.** `sqhpizjyqqhprrfgvevb.supabase.co` does not resolve on public DNS (8.8.8.8). Project deleted or purged after ~4.5 months idle. All 109 drafts / 5 users / 14 posts are unreachable | Only for live persistence; demo mode does not need it |
| **Tavily** | Working (200) | Optional |
| **Stripe** | Working (200), **live mode**, price `price_1TSmqZ…` active | Not on the demo path |
| **LinkedIn** | `LINKEDIN_CLIENT_ID` / `_SECRET` / `_REDIRECT_URI` are **empty** in `.env.local`; the 4 stored user tokens expired ~2026-07 | Simulated in demo mode |
| **Trigger.dev** | `tr_dev_…` key returned 401 | Not on the demo path |
| **Production build** | `next build` exits 0 | — |

Actions, in order:

1. Top up Anthropic credits (console → Plans & Billing). Blocks the one live call.
2. New Supabase project → run `src/lib/db/migrations/0000…0010*.sql` in order, then
   `supabase/migrations/20260508064356_moments_feature.sql`. Update `DATABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_URL`, anon + service-role keys.
3. Rotate the live Stripe secret key — it is 5 months old and sits in the working tree.
   (It is **not** in git history; `.gitignore:34` has always covered `.env*`.)
4. Leave LinkedIn and Trigger.dev alone unless you want live publishing. A new LinkedIn app
   needs `w_member_social` approval, which can take days — treat live publish as out of reach
   for this demo and simulate it.
5. Fix the duplicated `STRIPE_*` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` lines in `.env.local`.

---

## 1. Design system

Source of truth is `src/app/globals.css`. Current tokens are cold (`#F7F7F7` / `#2563EB` /
grey-blue text) and — the real problem — **the 14 primitives in `src/components/ui/` hardcode
hex values inside their `cva` variants** (`button.tsx` has `#2563EB`, `#E5E7EB`, `#374151`
inline). Nothing can be recoloured until those are tokenised. That is step one of Phase 1.

### 1.1 Palette

Authored in oklch (Tailwind 4 handles it natively); hex values are approximations for reference only.

```css
/* substrate — warm, replaces #F7F7F7 */
--paper:        oklch(0.975 0.014 95);   /* ~#FBF9F3  page */
--paper-sunk:   oklch(0.955 0.016 95);   /* ~#F4F1E8  alternating bands */
--surface:      #ffffff;                 /*           cards */

/* ink — warm near-black, replaces #111827 */
--ink:          oklch(0.19 0.012 95);    /* ~#221F1A  primary text + all 2px borders */
--ink-2:        oklch(0.19 0.012 95 / 0.64);
--ink-3:        oklch(0.19 0.012 95 / 0.48);
--hairline:     oklch(0.86 0.014 95);    /* ~#DCD7CA  internal dividers only */

/* accent — Voce blue, kept for brand continuity */
--accent:       #2563EB;
--accent-hover: #1D4ED8;
--accent-tint:  #EFF4FF;
```

Four data pastels at **identical lightness and chroma** — the reference's key trick, and what
makes four hues read as one family:

```css
--p-blue:  oklch(0.84 0.13 255);  /* specificity */
--p-coral: oklch(0.84 0.13  40);  /* ai-tells    */
--p-lilac: oklch(0.84 0.13 300);  /* cadence     */
--p-sage:  oklch(0.84 0.13 140);  /* grounding   */
```

**Two-register rule for the accent.** The reference fills whole bands with its pastel lime and
puts ink text on top. `#2563EB` is too dark for that. So:

- Colour-block bands, bento tiles, sign-up halves, active nav fill → **`--p-blue`** (light) with `--ink` text.
- Buttons, links, focus rings, small solid controls → **`#2563EB`** with white text.

### 1.2 Shape and shadow

Hard, zero-blur offset shadows. No soft shadows anywhere on the landing.

```css
--radius:        10px;           /* everything; 999px for pills; 50% for dots */
--border:        2px solid var(--ink);
--border-dashed: 2px dashed var(--ink);   /* = unverified / placeholder */

--shadow-card:   6px 6px 0 var(--ink);
--shadow-btn:    4px 4px 0 var(--ink);
--shadow-btn-h:  6px 6px 0 var(--ink);
--shadow-nav:    3px 3px 0 var(--ink);
--shadow-accent: 4px 4px 0 var(--accent);  /* inverse buttons on dark/pastel */
```

**Physical press** — one utility class, used on every button, pill and clickable card:

```css
.press { transition: transform 120ms, box-shadow 120ms; box-shadow: var(--shadow-btn); }
.press:hover  { transform: translate(-2px,-2px); box-shadow: var(--shadow-btn-h); }
.press:active { transform: translate( 2px, 2px); box-shadow: none; }
@media (prefers-reduced-motion: reduce) { .press { transition: none; } }
```

Spacing scale actually used: gaps 8 / 10 / 12 / 14 / 16 / 24 / 40. Card padding 24 (hero 24–32).
Page gutters 64. Section padding 72. Chips 28px tall, `0 12px`. Landing buttons 48–56px tall.

### 1.3 Type

Two new fonts via `next/font/google` (both free, both have the axes we need):

- **Archivo** — variable, `wght 800`, `font-stretch: 125%`. Display only.
  `104/0.92/-0.025em` hero · `64/1.0/-0.02em` H1 · `44/1.04/-0.015em` H2 ·
  `28/1.12` at `wght 750` + `stretch 112%` for H3.
- **Geist** + **Geist Mono** — body and metadata. `20/30` lead · `16/24` · `14/20` · `13/18`.
  Mono is used *only* for uppercase eyebrows and metadata: `12/16`, `0.06em`, uppercase.

Inter stays installed as a fallback. In-app density follows the reference's observed frequency:
**14px base, 13px secondary.**

### 1.4 App register (the "refined" half of the decision)

The app keeps the palette, the 2px ink borders, the 10px radius and `.press` on primary
buttons. It drops:

- sticker tilts (`±3deg`) — landing only
- 6px card shadows on dense lists → flat with hairline dividers; 3px only on interactive cards
- 104px display type → page titles at 24–28px

Layout: sidebar **248px** (currently 240), paper background, 2px right border. Nav rows 40px
with 20px icons; active row = `--p-blue` fill + 2px ink border + `--shadow-nav`. Content column
**1080px**, left edge 288px, 40px top padding.

---

## 2. Component libraries (all public, all free)

The repo is already on shadcn style **`base-nova`**, which is the **Base UI**-backed flavour —
so every `shadcn add` pulls Base UI, matching `@base-ui/react@1.4.1` that is already a
dependency. Do not introduce Radix-based copies; they use `asChild` where this codebase uses
Base UI's render prop.

| Need | Library | How | Licence |
|---|---|---|---|
| Primitives (tabs, table, sheet, dropdown, switch, slider, skeleton, alert, accordion, scroll-area, radio-group, label, toggle-group) | **shadcn/ui** `base-nova` | `npx shadcn@latest add tabs table sheet …` | MIT |
| Toasts — replaces hand-rolled `src/components/Toast.tsx` | **Sonner** | `npx shadcn@latest add sonner` | MIT |
| Command palette (⌘K) | **cmdk** | `npx shadcn@latest add command` | MIT |
| Mobile drawer / bottom sheet | **Vaul** | `npx shadcn@latest add drawer` | MIT |
| Charts for `/insights` | **Recharts** via shadcn chart | `npx shadcn@latest add chart` | MIT |
| Animation — staged generation, section entrances, list reordering | **Motion** (ex-framer-motion) | `npm i motion` | MIT |
| Landing flourish — Marquee, BentoGrid, NumberTicker, BorderBeam, AnimatedList, Terminal | **Magic UI** | `npx shadcn@latest add "https://magicui.design/r/<name>.json"` | MIT |
| Carousel (testimonials, only if used) | **Embla** via shadcn | `npx shadcn@latest add carousel` | MIT |
| Fonts | **Archivo**, **Geist**, **Geist Mono** | `next/font/google` | OFL |
| Icons | **Lucide** | already installed | ISC |

Magic UI components are copy-in source, so restyling them to the brutalist tokens is editing a
local file — not fighting a package.

### 2.1 Component-by-component mapping

| Current | Becomes | Shape change |
|---|---|---|
| `ui/button.tsx` (hex hardcoded) | same file, tokenised | 2px ink border, 10px radius, `.press`, 48–56px on landing / 36–40px in app |
| `ui/card.tsx` | same, tokenised | 2px ink border, `--shadow-card`, no soft shadow |
| `ui/badge.tsx` | same + **verdict variants** | `corroborated` = `--p-sage` fill, `unverified` = dashed, `flagged` = `--p-coral` fill |
| `components/Toast.tsx` | **delete** → Sonner | ink-bordered toast, hard shadow |
| `components/DraftCard.tsx` (719 lines) | restructured | 1080px card, 2px border, Voiceprint at 72px, mono meta row, verdict pills, keyboard affordances |
| `components/VoiceScoreBadge.tsx` | → **Voiceprint** (§3) | replaced by the petal device |
| `components/layout/Sidebar.tsx` | restyled | 248px, 40px rows, pastel active fill + 3px shadow |
| `components/RejectionModal.tsx` | shadcn `dialog` + `radio-group` | ink-bordered modal, 6px shadow |
| `components/SchedulingForm.tsx` | shadcn `select` + `calendar` | — |
| `components/projects/NewProjectWizard.tsx` | shadcn `tabs` stepper | numbered ink-circle step markers |
| `app/insights/page.tsx` (stub) | shadcn `chart` + Magic UI `NumberTicker` | real charts over fixture series |
| *(new)* | `components/Voiceprint.tsx` | the signature device |
| *(new)* | `components/CommandPalette.tsx` | ⌘K |
| *(new)* | `app/(marketing)/page.tsx` | the landing page |

---

## 3. The signature device: Voiceprint

The reference's whole identity hangs on one device — a four-petal flower whose petal lengths
encode four scores. Voce should have the equivalent, and **this is the one piece of
"exaggeration" the engineering already fully supports**: `src/lib/ai/quality-scan.ts` genuinely
computes all four of these per draft and persists them to `draft_queue.ai_tell_flags`.

| Petal | Bound to (real code) | Colour |
|---|---|---|
| **Specificity** | `struct_specificity` — proper nouns + non-round numbers | `--p-blue` |
| **Cadence** | `struct_sentence_cv` — sentence-length coefficient of variation | `--p-lilac` |
| **Humanness** | `struct_contraction_rate` inverse-weighted by `phrase_ai_tells` density | `--p-coral` |
| **Grounding** | `fact_check_unsupported_claims` — 0 unsupported = full petal | `--p-sage` |

Spec: inline SVG, 3px ink strokes, petal `rx` interpolated `11.4 → 25` by score. Three sizes —
**40px** (list rows), **72px** (draft card), **240px** (landing hero, onboarding, empty states).
Carries an `Advisory` pill, because the scan genuinely is advisory rather than gating — saying so
is both accurate and a better story than implying a hard gate.

It replaces every avatar and `VoiceScoreBadge` instance.

---

## 4. Landing page

New route group `src/app/(marketing)/page.tsx`, so it escapes `AppShell`. `src/app/page.tsx`
currently does `redirect("/inbox")` — change to serve the landing for signed-out visitors and
redirect signed-in ones.

Ten sections, following the reference's proven order:

1. **Nav** — 96px, 2px ink bottom border. "V" logo + wordmark left; 4 centre links (How it works ·
   Voiceprint · Pricing · Changelog); "Log in" underlined 2px at 3px offset; "Start free" accent
   button with 4px hard shadow.
2. **Hero** — 760px, 2-col (640px text). Headline 104px Archivo 800 stretch-125:
   *"Your voice. Not ChatGPT's."* Lead paragraph, two CTAs. Right: `--p-blue` slab holding two
   tilted (`-3deg` / `+3deg`) draft-preview cards, each with a 240px Voiceprint and a
   drop-shadow, plus a corner sticker pill — *"Same you. Every post."*
3. **Problem** — full-bleed `--ink` block, 460px. Centred 44px headline *"Everyone can tell."*
   3-row table: left column *what AI writes* (2px dashed cells), right column *what you'd
   actually say* (solid evidence chips). **Populate the left column from the real 31-phrase
   `phrase_ai_tells` list** — the content is already in `quality-rules.ts`.
4. **Voiceprint explainer** — mono eyebrow, H2, paragraph, 240px device beside 4 colour-dot
   legend rows naming the four real dimensions, with the `Advisory` pill.
5. **Bento "How it works"** — `--paper-sunk` band between 2px rules. 3-col grid, 260px rows,
   24px gaps, mixed span-2/span-1 tiles filled with the four pastels: Research → Voice
   calibration → Quality gate → Schedule & publish. Mono footers showing real artifacts:
   `> tavily: 14 items, 3 on-topic` · `> scan: 26 rules, 0 flags`.
6. **Demo** — split. Left: "Coming next" pill + checklist. Right: faux product window (URL pill,
   3 draft rows with verdict badges).
7. **Audience split** — *"One app, two rhythms."* Two cards in `--p-blue` and `--p-lilac`:
   daily cadence vs project/series. 28px headings, inverse buttons.
8. **Proof** — see the guardrail in §7. Keep as **styled dashed placeholders** until you have
   real quotes.
9. **Final CTA** — full-bleed `--p-blue` band, 420px, 64px ink headline *"Write like you."*
10. **Footer** — 140px, top rule, small logo + wordmark.

Motion: one-time fade-and-rise on section enter via Motion's `whileInView`, 24px travel, 400ms,
staggered 60ms. Respect `prefers-reduced-motion`.

---

## 5. App screens (full scope)

| Screen | Work |
|---|---|
| `/login`, `/signup` | Split 720/720. Left = solid pastel block with a 240px Voiceprint + 44px headline. Right = 64px heading, 36px inputs, accent submit. |
| `/onboarding` (847 lines, 5 steps) | Keep the 5 steps. Replace the progress bar with numbered ink-circle markers; each step becomes a 2px-bordered card; step 5 ends on a live Voiceprint of the first draft. |
| `/inbox` + `DraftCard` | The hero screen. 1080px cards, 72px Voiceprint, mono meta, verdict pills, amber flag banner restyled as `--p-coral` chips. Add **keyboard nav (J/K/A/R/E)** and a visible hint row — cheap, reads as a power tool. |
| `/projects`, `/projects/[id]` (740 lines) | Project cards with pastel headers; detail page gets underline tabs (Overview / Topics / Drafts / Published). |
| `/history` (531 lines) | Dense list rows, hairline dividers, no card shadows. Status pills. |
| `/archive` | Same list primitive as history, dashed-border rows to signal staleness. |
| `/insights` (stub today) | Real build: 4 `NumberTicker` stat tiles, a Recharts area chart (drafts vs approved over time), a Voiceprint-average radial, a per-topic bar. Fixture-backed. |
| `/settings` (2047 lines — the big one) | Section cards with mono uppercase eyebrows; the banned-words chip editor restyled as ink-bordered chips with hard shadows; tokenised inputs throughout. Highest-effort, lowest-visibility — do it last. |
| `AppShell` / `Sidebar` | 248px sidebar, pastel active state, ⌘K entry point, demo-mode ribbon. |

---

## 6. Demo mode (seeded spine + one live call)

### 6.1 Architecture

`src/lib/demo/`:

- `mode.ts` — `isDemo()` reading `DEMO_MODE`, `isLiveGenerate()` reading `DEMO_LIVE_GENERATE`.
- `fixtures.ts` — hand-authored: 12 drafts spanning clean / flagged / fact-check-flagged, a
  calibrated voice profile, 5 topics, 2 projects, 30 days of posts for the charts, cron history.
- `scripted-generate.ts` — the staged reveal.

Interception goes **at the top of each route handler**, not in a new data layer:

```ts
export async function GET() {
  if (isDemo()) return NextResponse.json(demoDrafts);
  // … existing code untouched
}
```

~20 routes, mechanical, zero risk to the real paths. RSC pages (`inbox/page.tsx`,
`settings/page.tsx`) get the same guard around their `db` calls. `src/middleware.ts` gets a
demo short-circuit that injects a synthetic user so nothing redirects to `/login`.

### 6.2 The staged generation moment

`POST /api/demo/generate` streams four steps with deliberate delays, Motion animates each in:

```
1. ~1.2s  Scanning 14 sources        → "3 on-topic"
2. ~2.5s  Drafting in your voice     → typewriter reveal of the draft
3. ~1.0s  Checking 26 quality rules  → rules tick through, 2 flag
4. ~0.8s  Verifying claims to source → Voiceprint petals animate to final
```

Total ~5.5s — long enough to narrate, short enough to hold a room.

### 6.3 The one live call

`DEMO_LIVE_GENERATE=true` puts a "Generate live" affordance on the inbox that calls the real
`generateDraft` (Sonnet 4.6, best-of-2, the real prompt stack). Wrapped in a 25s timeout with a
silent fallback to the scripted path on any error. Needs the Anthropic top-up from §0.

Rehearse this path. The real generator runs two parallel Sonnet calls at temperature 0.9 — the
output is genuinely variable, which is the point, but know what a bad roll looks like before
you are in front of people.

---

## 7. One guardrail

Staged timings, seeded drafts and illustrative charts are ordinary demo practice — nobody is
misled by a prototype that has data in it. Two things I would not fabricate:

- **Named customers, logos or testimonials.** The reference itself used dashed
  `[CUSTOMER LOGOS]` / `[TESTIMONIAL]` placeholders; keep that. An invented quote attributed to
  a real person or company is the one thing here that can actually come back on you.
- **Metrics presented as measured.** Label the insights numbers *illustrative* in the UI (a small
  mono caption is enough) rather than implying 109 drafts of real traction. The true numbers —
  109 drafts, 17 approved, 14 published across 3 users — are a fine story told as an early beta.

Everything else in this plan is fair game.

---

## 8. Phasing and effort

| Phase | Work | Est. |
|---|---|---|
| **0** | Unblock: credits, new Supabase + 12 migrations, env fill, rotate Stripe | 1–2h |
| **1** | ✅ **DONE** — Token rewrite + de-hardcode the primitives + fonts + `.press` + `shadcn add` batch | 3–4h |
| **2** | ✅ **DONE (pulled forward)** — `Voiceprint.tsx` — SVG, 3 sizes, bound to real scan data | 2–3h |
| **3** | Landing page — 10 sections, Magic UI, Motion | 6–8h |
| **4** | App shell + inbox + DraftCard + ⌘K + keyboard nav | 5–6h |
| **5** | Demo mode — fixtures, route guards, auth bypass, staged generate, live fallback | 4–5h |
| **6** | Remaining screens — onboarding, projects, history, archive, insights, settings | 8–12h |
| **7** | Polish — 1440px projector check, reduced-motion, dry run, reset script | 2–3h |
| | **Total** | **31–43h** |

**If the demo is sooner than that allows,** cut in this order: Phase 6 settings → Phase 6
archive/history → Phase 3 sections 6–8 → the live call (keep scripted only). Phases 1, 2, 4, 5
are the irreducible core: they are what the audience actually looks at.

Tell me the demo date and I will re-cut the phases to fit it.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| Hard shadows + 2px borders at settings-page density read as noisy | That is why the app register softens (§1.4); settings uses hairlines, not 6px shadows |
| 104px Archivo wrecks the layout on a 1366px projector | Clamp display type with `clamp()`; rehearse at the actual resolution |
| `settings-client.tsx` is 2047 lines — restyling it risks regressions | Do it last, behind the token swap, so it degrades gracefully if unfinished |
| Live Sonnet call produces a weak draft on stage | 25s timeout + silent fixture fallback; rehearse several rolls |
| 218 tests are prompt/scan snapshots — UI work should not touch them | Run `npm test` after Phase 1; any failure means a primitive leaked into prompt code |
| Demo-mode guards accidentally ship enabled | `DEMO_MODE` defaults false; add a visible ribbon when on |

---

## 9b. Phase 1 + 2 outcome (2026-10-05)

Built with five parallel subagents, then verified in a real browser at 1440px on `/_design`.

**Shipped**
- `globals.css` rewritten: warm paper substrate, warm ink, Voce blue kept, four pastels at
  identical L/C, hard-shadow tokens, and the signature utilities (`.press`, `.press-card`,
  `.ink-edge`, `.eyebrow`, `.display-xl/1/2/3`, `.link-rule`, sticker tilts) plus a
  `prefers-reduced-motion` block.
- Fonts: Archivo (display, `wdth` axis declared), Geist, Geist Mono. Inter kept as fallback.
- 10 primitives tokenised; all 44 hardcoded hex gone; zero blurred shadows remain anywhere
  in `src/components/ui/`.
- 15 new components installed (tabs, label, switch, skeleton, sonner, command, dropdown-menu,
  scroll-area, sheet, radio-group, chart, input-group) — all restyled to the register.
- `Voiceprint.tsx` + `tests/voiceprint.test.ts`, bound to the four dimensions `quality-scan.ts`
  really computes.
- `/_design` showcase at `src/app/%5Fdesign/page.tsx` — the live token reference sheet.

**Decisions made during the build**
- `--p-amber` added as a **status-only fifth pastel** so badge `warning` stops colliding with
  `flagged`. Deliberately not a Voiceprint axis — the device stays four-petalled.
- Focus uses `outline` + offset, **not** Tailwind's `ring-*`. The ring utility sets
  `box-shadow`, and the utilities layer beats `@layer components`, so a focused button lost its
  hard shadow. Outline also behaves better in forced-colors mode.
- `cn` unified on `@/lib/utils` across 11 files and the `cn` package dropped. The newer shadcn
  registry imports a `cn` package that compiles merge tables from your theme via `npx cn build`,
  which was never run — so it did not know `shadow-card`, `bg-p-blue` etc. and class overrides
  could silently fail to dedupe.
- `null` in `ai_tell_flags` now means **clean** (full petals), not unknown. Both serialisers
  return null for a zero-flag draft, so treating it as neutral rendered the best drafts as a
  half-open flower. `NEUTRAL` is reserved for payloads that exist but will not parse.
- Route folder is `%5Fdesign`, not `_design` — App Router treats `_`-prefixed folders as private.

**Verified in-browser, not just compiled**
- Archivo's width axis genuinely applies: computed `font-stretch: 125%`, weight 800, loaded face
  reports a 62–125% width range. `clamp()` resolves to 43.2px at 1440px.
- The four pastels read as one family.
- Every form control — input, textarea, select, switch, radio — is 2px ink / 10px radius.
  Switch and radio needed fixing; they had shipped at 1px hairline.
- Card: 2px ink + `6px 6px 0`. Active tab: `--p-blue` + ink border + `2px 2px 0`.
- The three provenance badges render live, with dashed = unverified.

**Known caveat:** the in-app preview pane freezes CSS transitions, so the `.press` hover/active
lift cannot be *observed* there — any transitioned property reads back at its start value. The
contract was verified by construction instead (rule present, selector matches, rest state exact,
`--sh-btn-h` resolving to `6px 6px 0`). Worth one manual hover in a normal browser.

---

## 9c. Phases 4 + 6 outcome (2026-10-05)

Every app screen is now on the design system. **Zero hardcoded hex and zero soft shadows
remain anywhere under `src/app` or `src/components`.**

| Surface | Hex before → after |
|---|---|
| settings-client.tsx | 263 → 0 |
| onboarding | 114 → 0 |
| history | 75 → 0 |
| DraftCard + SchedulingForm + RejectionModal | 144 → 0 |
| projects (list + detail) + archive | 70 → 0 |
| inbox-client | 29 → 0 |
| signup / login | 54 → 0 |
| Sidebar / AppShell | 28 → 0 |
| LinkedInPreview | 12 → 0 (via a named `--linkedin` token) |

Also added: `src/components/ui/chip.tsx`, the interactive sibling of `Badge` — for user-owned
values that can be added, removed or selected, with an accessible remove button. `Badge` stays
read-only status. Dashed border keeps its system meaning of provisional/unverified, which is why
archived rows and never-connected integrations use it.

**The density rule**, applied throughout: structure gets ink (2px border + `shadow-card` on
section cards and genuinely separate objects), density gets hairlines (list rows are flat inside
one bordered container). A 6px hard shadow on every settings row would have been deafening.

**Corrections made on top of the agents' work**
- Content column re-centred. It had been pinned left at 288px to match the 1440px reference
  canvas, but a demo on a 1920px projector would leave ~550px of dead space.
- LinkedIn status: `expired` → coral (publishing is broken), `not_connected` → neutral dashed
  (never configured is provisional, not broken). It had both as warnings.
- Logo mark unified. Login and signup had drifted to an amber fill with ink glyph; the canonical
  mark is accent fill, ink border, 2px hard shadow, white glyph, as in the sidebar.
- `Toast.tsx` was the last soft shadow in the codebase (`shadow-lg`, slate/red). Now hard offset
  with sage/coral pastels.

**Behaviour changes accepted** (both deliberate, both arguably improvements):
- Chips delete only via the × now, not a click anywhere on the chip. The old behaviour was a
  footgun. **Note:** `NewProjectWizard` pills still remove on whole-pill click — an inconsistency
  worth closing.
- `RejectionModal` now closes on Escape and outside-click (it moved to the Dialog primitive),
  guarded so it cannot close mid-save.

**Verified:** clean `next build` from a wiped `.next` (41 routes), 224/224 tests, `tsc` clean,
all 9 routes returning 200 with no error overlay, sidebar measured at 248px with constant 40px
rows, project cards at 2px ink / 10px radius / `6px 6px 0`, and zero cold greys in the computed
styles of a rendered page.

**Still open:** `/insights` charts are fixture numbers rather than Recharts; `Toast.tsx` is
tokenised but not yet replaced by Sonner; the marketing landing page (Phase 3) is not built.

---

## 10. Open questions for you

1. **Demo date?** Drives the §8 cut line.
2. **Audience** — investors, a hiring manager, or users? Changes whether section 7 (audience
   split) or section 5 (how it works) leads.
3. **Wordmark** — keep the blue "V" square, or redraw it in the new register? A 2px ink-outlined
   mark with a hard shadow would be more consistent, but it is a brand change and per
   `CLAUDE.md` that is your call, not mine.
4. **Pricing section** — show the real $10/mo, or hide pricing for this demo?
