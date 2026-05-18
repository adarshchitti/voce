# Voce — Project Rules

> Living document. Updated as new conventions are agreed. Last updated: 2026-05-17.

This file is the source of truth for **how we work on Voce**, separate from what we are building (see `VOCE_PRD_v3.md` for that).

The rules below are committed. The rules they will be added to next are tracked in the Notion workspace under **Decision Log**. When a new convention is agreed, add it here in a PR and reference the decision-log entry.

---

## 1. The Prime Rule

**Important technical and product decisions are finalized only after discussion between the project owner (Adarsh) and Claude.**

Claude does not make architecture, stack, schema, vendor, or scope decisions unilaterally. Claude's job on these decisions is to:

1. Surface the realistic options.
2. State the tradeoffs honestly, including the option Claude would lean toward and why.
3. Wait for Adarsh to call it.

What counts as "important":

- Anything that constrains future work (data model, framework, hosting, third-party services, auth, billing).
- Anything that would be painful to reverse later (database choice, repo restructure, public API shape).
- Anything that changes scope, timeline, or what ships in v1.
- Anything that touches user-visible product behavior in a way the PRD doesn't already settle.

What Claude can decide alone:

- Naming of internal variables, files, and helper functions.
- Local refactors that don't change behavior.
- Test scaffolding for code Claude is writing.
- Formatting, linting, and style fixes when no convention conflict exists.

When in doubt, ask. The cost of an extra discussion is small. The cost of an unraised decision compounding for three weeks is large.

---

## 2. Version Control

### 2.1 Branching model: Git Flow lite

Two long-lived branches:

- **`dev`** — default branch on GitHub. All feature branches merge here. This is the integration line. CI runs on every PR. Anything that lands here should be at least demo-worthy on a staging environment.
- **`production`** — protected. Only receives merges from `dev` via reviewed PR. This is what real users see. Every merge to `production` is, in effect, a release.

Feature branches live off `dev`, never off `production`.

### 2.2 Branch naming

Format: `<type>/<ticket-id>-<short-kebab-description>`

Types:

- `feat/` — new functionality.
- `fix/` — bug fix.
- `chore/` — tooling, deps, config, non-product housekeeping.
- `refactor/` — internal restructure with no behavior change.
- `docs/` — documentation only.
- `exp/` — exploratory branch, not expected to merge as-is.

Examples:

- `feat/VOCE-42-github-artifact-ingestion`
- `fix/VOCE-87-draft-edit-loses-cursor`
- `chore/VOCE-3-add-eslint-config`

If there's no ticket yet, file the ticket first.

### 2.3 Commit messages

Conventional Commits style, but pragmatic. Format:

```
<type>(<scope>): <short summary in imperative mood>

<optional body explaining why, not what>

Refs: VOCE-42
```

Types match the branch types above. Scope is optional but useful (`feat(ingestion): ...`, `fix(ui): ...`).

Why: not because we want to generate changelogs automatically (we don't, yet), but because it forces a small amount of thinking before each commit and keeps `git log` scannable.

### 2.4 Pull request rules

Every PR to `dev`:

- Links the ticket it implements.
- Has a description that answers: what changed, why, how to verify.
- Passes CI (when CI exists; not yet at the time of this writing).
- Is reviewed before merge, even on a solo project, by re-reading the diff in the GitHub UI after a break. The diff view catches things the local editor hides.

Every PR from `dev` to `production`:

- Lists the user-visible changes since the last `production` merge.
- Notes any migrations, env var changes, or manual steps required at deploy.
- Requires explicit approval (in the PR or in chat) before merging.

### 2.5 Branch protection (to configure on GitHub)

To set up after the next planning session:

- `production`: require PR review, require status checks, no direct pushes, no force-push.
- `dev`: require PR for merges (not a hard rule day one, but the target state), no force-push.

### 2.6 What does NOT belong in commits

- Secrets, credentials, API keys, tokens. Use `.env.local` (gitignored) for development. Production secrets live in the deployment platform's secret store, decided later.
- Large binary blobs. If something needs to be tracked but is large, decide together whether Git LFS or external storage is the right answer.
- Generated files that can be reproduced from source (`dist/`, `build/`, `node_modules/`, `.next/`, etc.).
- Personal IDE config (use a global gitignore for those, not the repo's `.gitignore`).

---

## 3. Tickets, Epics, and Planning

(Tracking system: TBD — likely GitHub Issues + GitHub Projects, or Linear. Decided in planning session.)

### 3.1 Hierarchy

- **Epic.** One coherent chunk of product work, usually mapping to a PRD phase or a major feature. Example: "Phase E — Graph foundation."
- **Ticket.** A single deliverable unit of work. Should be completable in one focused session, ideally under a day of work. If a ticket grows past that, split it.
- **Sub-task.** Optional. Used inside a ticket for a checklist of steps when the ticket has clear sub-steps.

### 3.2 Ticket anatomy

Every ticket should have:

- A clear, specific title (not "fix bug" — "fix cursor jump when editing a draft that has been auto-saved").
- A description: the problem, the desired outcome, anything load-bearing about the constraints.
- Acceptance criteria: a short checklist of what makes the ticket done.
- Links to relevant PRD sections, prior tickets, or Notion pages.
- Labels: at minimum `area:*` (e.g., `area:ingestion`, `area:ui`, `area:auth`) and `phase:*` (e.g., `phase:E`).

### 3.3 What lives in tickets vs in Notion

- **Notion** holds direction, context, open questions, decision log. It is the project memory.
- **Tickets** hold work. They are the unit of execution.

If a ticket reveals an open question that affects more than just that ticket, the question goes in Notion's *Uncertainties* page. If a decision gets made inside a ticket that affects the whole project, the decision gets logged in Notion's *Decision Log*.

---

## 4. Code Conventions

(Lightweight for now. Will be expanded once stack decisions are made.)

- **Formatting and linting:** automated. No manual style debates. Whatever tools we adopt (Prettier, ESLint, Ruff, etc.) run on save and in CI.
- **Tests:** every non-trivial new behavior gets at least one test. "Non-trivial" is judgment, not a rule. UI tweaks usually don't need tests. Data transformations and business logic almost always do.
- **Comments:** explain *why*, not *what*. The code shows what. Comments earn their place by capturing reasoning that the code can't carry.
- **TODOs:** every `TODO` in code is paired with a ticket. Untracked TODOs go stale. Format: `// TODO(VOCE-42): replace stub with real implementation`.
- **Dead code:** delete it. Git remembers.

---

## 5. Privacy, Security, and Data Handling

The PRD makes commitments to users about what Voce ingests and how. These are not negotiable:

- **Only public or user-marked-shareable work artifacts enter the experience graph.** Private internship work, NDA-covered code, anything from a private repo or internal Slack stays out. Enforced at ingestion, not at draft time.
- **Secrets do not get logged.** API keys, tokens, OAuth secrets, user PII, draft content. Logging needs an explicit allowlist of what's safe to log.
- **User-deletable everything.** Account deletion removes data. Data export produces a portable archive. These are phase H, but the data model has to be designed with them in mind from day one.
- **No cross-user feature surfaces.** No leaderboards, no "users like you," no shared feeds. The graph is per-user. Aggregate anonymized telemetry for product improvement is acceptable; cross-user surfaces are not.

The PRD's anti-amplification principle is also a rule: **Voce does not optimize for engagement.** No viral hooks, no A/B variant generation, no engagement-prediction models, no growth agent. If a feature proposal smells like one of these, it doesn't ship.

---

## 6. AI / Agent Collaboration (working with Claude)

When working with Claude on this project:

- Claude reads `rules.md` and `VOCE_PRD_v3.md` first. Both files are the working contract.
- Claude does not invent product scope. Anything not in the PRD that affects user-visible behavior is a Prime Rule decision: discuss first.
- Claude flags tradeoffs explicitly. "Option A buys us X but costs Y; option B is the inverse." If Claude isn't presenting tradeoffs, ask for them.
- Claude prefers small, reviewable changes over large ones. A 600-line diff is worse than three 200-line diffs even if the total work is the same.
- Claude does not auto-merge, auto-deploy, or take irreversible actions without explicit approval in chat.
- Claude updates Notion as decisions are made: the Decision Log gets an entry, the Timeline gets an entry, the Uncertainties page gets entries struck through as they're resolved.

---

## 7. How this document evolves

Anyone (currently: Adarsh and Claude) can propose a rule change. The change is discussed, decided per the Prime Rule, logged in Notion's Decision Log, and committed to this file in a PR. The PR description references the decision-log entry.

If a rule is being broken because it's wrong, that's a signal to update the rule, not to keep breaking it silently.

---

_End of rules.md. Add new sections above this line._
