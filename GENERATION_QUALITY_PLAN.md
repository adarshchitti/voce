# Generation Quality Plan — May 2026

> Status: Spec complete, not yet built
> Covers: (1) AI tell suppression overhaul, (2) memory and correction loop, (3) image generation
> These three areas are related: better generation + correction loop = voice compounding over time.
> Images are additive and configurable — they do not block either of the above.
> All decisions grounded in the May 2026 research session.

---

## Part 1 — Generation System Prompt Overhaul

### Why the current prompt is insufficient

Rule 14 and the current AI tell blocklist (Stage 1) capture word-level tells. Research confirms the highest-confidence signals are _structural and statistical_, not lexical. LinkedIn's 360Brew ranker uses a 150B-parameter model that reads semantically. Prompt-level word bans alone are inadequate — and naming a forbidden word in the prompt can paradoxically prime its generation ("semantic gravity wells" finding, arXiv 2601.08070).

The architecture needs two layers:

1. **Prompt layer** — constraints framed positively (what to do, not what to avoid). Provides writing samples, stylometric measurements, structural requirements, and structure rotation for variance.
2. **Post-generation scan layer** — code-level checks applied to the output _before_ it enters the inbox. Critically: this layer is **read-only except for two narrow cases**. It surfaces flags for the user to act on. It does not auto-rewrite.

**Why the scan layer must not auto-substitute word-level tells:**
"Leverage" on a banned word list is correct 80% of the time. "The lever arm creates leverage in the joint" is the other 20%. A regex substitution pass has no semantic context. More importantly, the user may have deliberately chosen a word that happens to be on the blocklist — auto-substituting it silently corrupts their post without their knowledge. A good editor flags; they do not rewrite.

**The only two auto-actions permitted in the scan layer:**

- Strip markdown leakage (asterisks, hashes, backticks) — these are never intentional in a LinkedIn post body
- Remove engagement-beg phrases and trigger a regeneration — these are never a voice choice and LinkedIn algorithmically penalises them

Everything else is an amber flag. The user reads the flag and decides.

### The extended tell taxonomy (grounded in research)

**Category A: Word-level (scan flags only — no auto-substitution)**

These appear in the scan output as a list of flagged words with their locations. The user sees them as amber highlights in the draft card. They decide whether to change them or ignore the flag. The scan does NOT substitute anything.

Rationale: these words are context-dependent. Flagging them costs nothing. Silently rewriting them corrupts the user's post.

```
LEXICAL FLAGS (flag in scan output, no substitution):

Verbs: delve, leverage (verb form), utilize, underscore (verb), navigate,
  foster, unleash, supercharge, revolutionize, unlock, elevate, embark,
  streamline, empower, harness, spearhead, pioneer, catalyze

Adjectives: pivotal, paramount, crucial, groundbreaking, transformative,
  holistic, robust, seamless, comprehensive, nuanced, multifaceted,
  intricate, cutting-edge, game-changing, unprecedented, dynamic,
  ever-evolving, meticulous, commendable

Abstract nouns: landscape, ecosystem, realm, journey, paradigm, synergy,
  alignment, intersection, interplay, cornerstone, testament, beacon,
  confluence, fabric, tapestry

Filler adverbs: notably, importantly, crucially, fundamentally, essentially,
  ultimately, undoubtedly

Transitions: Moreover, Furthermore, Additionally, In essence, In conclusion,
  To summarize, At its core, At the heart of, When it comes to,
  It is worth noting, It's important to note
```

**Also injected into the generation prompt positively** (not as bans — as substitutions the model can reach for):

```
WORD CHOICES:
- "use" not "leverage" or "utilize"
- "show" not "demonstrate" or "illustrate"
- "build" not "develop" or "construct"
- "find" not "discover" or "uncover"
- "change" not "transform" or "revolutionize"
- "important" not "crucial" or "pivotal"
- "different" not "unique" or "unprecedented"
```

**Category B: Phrase-level (scan flags — two sub-tiers)**

Sub-tier B1: Flag as amber warning, user resolves before approving.
Sub-tier B2: Auto-remove + trigger regeneration. These are the only phrase-level auto-actions.

```
B1 — Amber flag (user resolves):
  Fake-vulnerability openers:
    "I'll be honest", "Here's the hard truth", "Truth bomb:", "Real talk:",
    "I used to think .* I was wrong", "Unpopular opinion:", "Hot take:"

  Pseudo-profundity:
    "the magic happens when", "true growth comes from", "at the end of the day",
    "a testament to", "speaks volumes", "now more than ever",
    "in today's rapidly evolving", "let's dive in", "buckle up",
    "here's the kicker", "the bottom line is", "this changes everything",
    "game-changer", "moving the needle", "this is what most people miss"

  Universal-audience flatness:
    "many leaders", "most professionals", "we've all been there",
    "everyone knows", "we all want"

B2 — Auto-remove + regenerate (these are never acceptable, never a voice choice):
  Engagement begs:
    "what do you think", "drop a comment", "let me know below",
    "agree?", "thoughts?", "comment yes if", "type .* to receive",
    "tag someone who", "repost if", "share if you"
```

**Category C: Structural (scan flags — all flag-only, no auto-action)**

These require analysis of the output structure, not just string matching.

```
STRUCTURAL CHECKS (all flag-only — no auto-editing):

1. Antithesis density — count occurrences of "not .* but", "it's not .* it's",
   "most people .* the best", "stop .* start"
   FLAG if: >1 per post.

2. Tricolon density — count 3-item parallel structures ("X. Y. Z." or "X, Y, and Z"
   as standalone sentences)
   FLAG if: >1 per post.

3. Sentence-length coefficient of variation — calculate stddev/mean of sentence
   word counts across the post.
   FLAG if: CV < 0.4 (indicates uniform AI sentence rhythm)
   Note: do not auto-fix. This is a signal for the user to read the draft and
   notice whether it actually feels monotone.

4. Em-dash density — count em-dashes (— character)
   FLAG if: >1 per post.

5. Broetry detection — count lines with 1–5 words followed by a blank line.
   FLAG if: >60% of non-blank lines are single-line broetry fragments.

6. Paragraph uniformity — check paragraph word count distribution.
   FLAG if: no paragraph ≥40 words AND no paragraph ≤10 words (fully uniform).

7. Specificity check — scan for at least one proper noun, at least one non-round number.
   FLAG if: neither present. Message: "This draft lacks concrete specifics."

8. Hashtag count — max 3.
   FLAG if: >3. (This one is enforced at publish time regardless of user decision.)

9. Emoji count — checked against user's voice profile emoji_frequency.
   FLAG if: count exceeds user's profile setting.

10. Markdown leakage — asterisks (**bold**, *italic*), hashes (## headings), backticks.
    ACTION: AUTO-STRIP silently. These are formatting artifacts, never intentional content.

11. Character count — target range 1,200–2,800 characters.
    FLAG if: outside range. Advisory, not blocking.

12. Template repetition — compare structural fingerprint against user's last 5 approved posts.
    FLAG if: hook type and list presence both match >3 of the last 5.
    Message: "Similar structure to your recent posts."

13. Contraction rate — in first-person sentences, contractions should appear at ≥30% rate.
    FLAG if: below threshold. Advisory.
```

### Prompt layer — what changes

The existing generation prompt uses the voice profile's structured columns. The overhaul adds five things:

**1. The "thoughtful expert" frame (replaces generic instructions)**

```
Write as a thoughtful expert who is sharing a specific observation, not as a
content creator optimising for engagement. The post should feel like it came
from a person with strong opinions and real experience, not from someone who
studied what performs well on LinkedIn.

Do NOT write like an AI assistant. Do NOT provide balanced summaries of
multiple perspectives. Do NOT hedge with "many people believe" or "it's worth
noting." Write with conviction, specificity, and first-person ownership.
```

**2. Structural requirements injected positively**

```
REQUIRED ELEMENTS (all must be present):
- At least one specific proper noun (person, company, product, tool, place)
- At least one non-round number (not 3, 5, 7, 10, 50, 100)
- At least one paragraph over 40 words (you may have others that are shorter)
- Sentence length must vary substantially — mix short punchy sentences with
  longer ones. Do not write all sentences at 15–20 words.
- Use contractions in first-person sentences (I'm, I've, I'd, don't, can't)

FORBIDDEN STRUCTURES (these will be caught by a post-generation scanner):
- Starting the post with a question hook (overused format)
- Ending with an engagement beg of any kind
- The "not X, but Y" antithesis pattern more than once
- Three parallel one-liners as the climax of the post (tricolon)
- Every sentence on its own line with double spacing (broetry format)
```

**3. Voice measurement injection (from two-pass extraction)**

The current prompt uses the voice profile's qualitative fields. Add the quantitative fields from the Stage 2 voice overhaul as concrete measurements:

```
WRITING MEASUREMENTS (from this user's actual posts):
- Average sentence: ~{{avg_sentence_length_words}} words. Range: {{sentence_length_range}}.
- Post length: typically ~{{avg_words_per_post}} words.
- List usage: {{list_usage}} (if 'never', use NO lists in this draft)
- Paragraph style: {{paragraph_style}}
- Hook examples from their actual posts (reproduce this style, not a template):
  {{hook_examples[0]}}
  {{hook_examples[1]}}
  {{hook_examples[2]}}

WHAT THIS PERSON NEVER DOES:
{{never_patterns}}
```

**4. Contrastive anchor (from Stage 2 voice research)**

Include 1–2 posts from a different generic AI-style writer labeled explicitly as "NOT this voice." Research (Yazan et al. 2025) shows this beats positive examples alone by 15%. These are static — a set of 3 canonical LinkedIn AI-slop examples stored in prompts.ts, not user data.

```
NOT this voice (example of what to avoid — generic AI LinkedIn style):
"Leadership isn't about titles. It's about impact.
In today's rapidly evolving landscape, the most successful leaders understand
that true growth comes from within. Here are 5 lessons I've learned:
1. Lead with empathy
2. Embrace vulnerability
3. Foster psychological safety
[...]
What leadership lesson resonates most with you? Drop a comment below! 🚀"

The user's posts sound NOTHING like this.
```

**5. Few-shot examples (existing, improved ordering)**

Keep the user's approved posts as examples. Change ordering to: voice-representative examples in positions 1–3, most-recent approved post in the final position (recency bias benefit confirmed by Calibrate-Before-Use research).

### Rule manifest injection (correction loop outputs — see Part 2)

Once the correction loop is running, a `rules.md` manifest gets injected here:

```
LEARNED STYLE RULES (extracted from this user's editing history):
{{rules_manifest}}
```

This section starts empty and populates after the first 10 edits. See Part 2 for the extraction architecture.

### Structural variance — solving the human randomness problem

**The problem:** Even with a calibrated voice profile, the model defaults to a narrow distribution of structures. Real human posting has genuine randomness — the same person writes a four-paragraph analytical post one week and a two-sentence provocation the next. The same voice, different shape. The model does not do this naturally.

**Why this cannot be solved by prompt alone:** Telling the LLM "vary your structure" produces superficial variation (slightly different word order, different first paragraph topic) not structural variation (fundamentally different post architectures). The model's output distribution is too narrow by default.

**Three levers, applied together:**

**Lever 1 — Structure rotation (prompt-injected per generation call)**

A structure template is selected at generation time and rotated across the user's draft history so the same structure never appears more than twice in a row. The template is a concrete constraint, not a vague instruction:

```typescript
// In generate.ts — pick structure for this draft
const STRUCTURE_TEMPLATES = [
  {
    id: "scene_first",
    label: "Scene opening",
    instruction: `Open with a specific scene or moment — a real situation, a meeting, 
    a thing you noticed. One paragraph. Then develop the point. Close with what it means. 
    Do NOT start with "I" as the first word.`,
  },
  {
    id: "counterintuitive",
    label: "Counterintuitive claim",
    instruction: `Open with the claim that contradicts the obvious take on this topic. 
    No preamble. Then show the evidence or reasoning. One-sentence close that 
    restates the implication. Short post, under 200 words.`,
  },
  {
    id: "data_unpack",
    label: "Data unpack",
    instruction: `Open with the specific number or finding. One sentence. Then unpack 
    what it actually means — not what it says on the surface. Close in first person 
    with what you'd do differently because of it.`,
  },
  {
    id: "mid_thought",
    label: "Mid-thought entry",
    instruction: `Start mid-thought, as if continuing a conversation already in progress. 
    No context-setting opener. Build the argument across 3–4 paragraphs of varying length. 
    No explicit close — end on the observation, not a summary.`,
  },
  {
    id: "specific_mistake",
    label: "Specific mistake",
    instruction: `Open with a specific mistake, wrong assumption, or thing that surprised you. 
    Real and named — not generic. Explain what changed. Do not moralize or generalize 
    at the end. Keep it personal and specific throughout.`,
  },
];

// Rotation: pick the structure not used in the last 2 drafts for this user
// Store last_structure_id in user_settings or draft_queue
```

The structure label is shown on the draft card in the inbox ("Scene opening" / "Data unpack" etc.) so the user can see why the post is shaped the way it is and can request a different structure at regeneration time.

**Lever 2 — Temperature and two-candidate generation**

Run the generation at temperature 0.9 (higher than the default 0.7). Higher temperature produces more lexical variety and less predictable sentence construction. The risk is quality variance — some outputs at 0.9 are better, some are worse.

Mitigation: generate two candidates per draft, run the voice score on both, show the higher-scoring one. Only one candidate enters the inbox. The other is discarded. Cost: ~2× generation tokens per draft, but using Haiku for the voice score keeps the second LLM call cheap. Net additional cost per draft: ~$0.003–0.005.

```typescript
// In generate.ts
const [candidateA, candidateB] = await Promise.all([
  generateDraft(prompt, { temperature: 0.9 }),
  generateDraft(prompt, { temperature: 0.9 }),
]);
const [scoreA, scoreB] = await Promise.all([
  scoreVoice(candidateA, voiceProfile),
  scoreVoice(candidateB, voiceProfile),
]);
const draft = scoreA >= scoreB ? candidateA : candidateB;
```

**Lever 3 — Correction loop learns variance preferences (Part 2)**

Over time, the rule extraction pass will learn structural preferences from edits — if the user always flattens the mid-thought structure and expands the scene-opening structure, the rules manifest will reflect this. The structure rotation then naturally weights toward structures the user keeps. This happens automatically from the correction loop, no additional implementation needed.

**Trade-off:** Two-candidate generation adds cost and latency to the cron phase 2. At 3 drafts/user/day, latency is irrelevant (runs overnight). Cost addition is ~$0.01/user/day (~$0.30/month), negligible. The quality improvement justifies it.

---

## Part 2 — Memory and Correction Loop

### The core finding that changes the architecture

The naive Wispr-style implementation would be: when a user edits a draft, add the `(original, edited)` pair as a few-shot example in the next generation prompt. **This is wrong.** The Corrective-ICL paper (Calibration Research 2024, arXiv 2503.16022) found corrective examples _underperform_ standard few-shot examples because they prime the model toward the error pattern even while demonstrating the fix. The right pattern is:

1. **Accumulate edit events** in a log.
2. **Every 10 new edits**, run an offline LLM pass that reads all edits and extracts _rules_ (e.g., "This user always removes em-dashes", "This user prefers 'use' not 'leverage'", "This user shortens the closing paragraph to 1–2 sentences").
3. **Inject the rules manifest** — not the raw events — into future generation prompts.
4. Keep a **dual-layer memory**: persistent voice profile (slow decay, updated only when corpus changes ≥10%) + recent rules ring buffer (14-day half-life, reset on new extraction).
5. **Debounce**: a correction only becomes a rule after it recurs ≥3 times across different drafts. Single-occurrence corrections are noise.

### Schema

```sql
-- PER USER: append-only log of every edit event
-- Written at: approve-with-edits time, regeneration time, inline edit save
edit_events (
  id                uuid primary key,
  user_id           text not null,
  draft_id          uuid references draft_queue(id),
  event_type        text not null,  -- 'inline_edit' | 'regeneration' | 'personal_angle'
  original_text     text not null,  -- full draft text before edit
  edited_text       text not null,  -- full draft text after edit
  diff_summary      text,           -- LLM-generated 1-sentence summary of what changed
  edit_distance     integer,        -- Levenshtein distance (quick severity proxy)
  edit_depth_pct    integer,        -- (edit_distance / len(original)) * 100
  topic_cluster     text,           -- from research_item tags
  hook_type         text,           -- 'question'|'bold_claim'|'personal_story'|'data_point'
  created_at        timestamptz not null default now()
)

-- PER USER: extracted rule manifest — refreshed every 10 edit events
-- This is what gets injected into generation prompts, not raw edit_events
voice_rules (
  id                uuid primary key,
  user_id           text not null unique,
  rules_markdown    text not null,    -- the full rules manifest, injected into prompts
  rules_structured  jsonb,            -- machine-readable version for UI display
  edit_events_count integer not null default 0,  -- count at last extraction
  last_extracted_at timestamptz not null default now(),
  extraction_model  text not null default 'claude-haiku-4-5-20251001',
  version           integer not null default 1
)

-- PER USER: compact memory of each approved/rejected draft for retrieval
-- Already in STAGE2_PLAN as draft_memories — adding fields here
-- (If draft_memories already exists, add these columns via ALTER TABLE)
ALTER TABLE draft_memories ADD COLUMN IF NOT EXISTS hook_type text;
ALTER TABLE draft_memories ADD COLUMN IF NOT EXISTS edit_depth_pct integer;
ALTER TABLE draft_memories ADD COLUMN IF NOT EXISTS was_edited boolean not null default false;
ALTER TABLE draft_memories ADD COLUMN IF NOT EXISTS edit_summary text;  -- 1-sentence diff summary
ALTER TABLE draft_memories ADD COLUMN IF NOT EXISTS voice_score_at_generation integer;
ALTER TABLE draft_memories ADD COLUMN IF NOT EXISTS regeneration_count integer not null default 0;
```

### Write path — when does data flow in?

**At approve-with-edits:**

- Write to `edit_events` with `event_type = 'inline_edit'`
- Write to `draft_memories` with `was_edited = true`, `edit_depth_pct` calculated
- Compute Levenshtein distance (use the `fastest-levenshtein` npm package or equivalent)
- Generate `diff_summary` via Haiku: "Summarize in one sentence what changed between these two texts." (~100 tokens, negligible cost)
- After write: check if `edit_events` count for this user is a multiple of 10 → if yes, enqueue rule extraction job

**At approve-without-edits:**

- Write to `draft_memories` only. `was_edited = false`. No edit event.

**At regeneration:**

- Write to `edit_events` with `event_type = 'regeneration'`
- `edited_text` = the regeneration instruction (not the output — the instruction is what signals intent)
- `diff_summary` = the instruction text itself (already is a summary)

**At rejection:**

- No edit event. Rejection reason already goes to `rejection_reasons` table (Stage 1).
- Write to `draft_memories` with `approved = false`.

### Rule extraction — the offline LLM pass

Runs as a Trigger.dev background task, triggered when `edit_events` count reaches a multiple of 10.

```
Extraction prompt (Haiku model):

You are analysing editing patterns for a LinkedIn post writer.
Below are their last [N] edits, each showing what changed.
For each edit, a diff summary is provided.

Your job: identify recurring patterns and extract them as concrete writing rules.

RULES FOR EXTRACTION:
- Only extract a rule if the same pattern appears in 3 or more edits.
- Express rules positively with substitution when possible ("Use 'use', not 'leverage'")
- Where substitution isn't possible, state the pattern clearly ("Always shorten the
  closing paragraph to 1–2 sentences")
- Maximum 15 rules. If more patterns exist, keep the most frequent.
- Output as a numbered markdown list, one rule per line.
- Do NOT include rules that are already in the system-level AI tell blocklist
  (e.g., do not say "avoid using 'delve'" — that's already enforced).

EDIT HISTORY:
[last N diff_summaries, with recurrence count]

Output the rules list only. No preamble.
```

The output is stored in `voice_rules.rules_markdown`. This gets injected verbatim into the generation prompt under "LEARNED STYLE RULES."

The `rules_structured` JSONB is a parsed version used to display rules in the UI (Settings → Voice → Learned Rules) so users can see and optionally delete individual rules.

### Dual-layer decay

**Layer 1 — Persistent voice profile** (`voice_profiles` table)

- Regenerated when sample post count changes by ≥10% or when user manually triggers re-extraction.
- No time-based decay. These patterns are slow-changing and represent the user's actual writing corpus.
- Injected first in generation prompt.

**Layer 2 — Recent rule manifest** (`voice_rules` table)

- Refreshed every 10 edits.
- Rules carry an implicit recency weight because extraction only uses the **last 40 edit events** (sliding window). Older patterns age out of the window naturally.
- No countdown timer needed — the sliding window handles decay without explicit TTL management.

**Debounce rule:** Before promoting a pattern to a rule, the extraction prompt receives recurrence counts. It is instructed to require ≥3 occurrences. This prevents a single unusual editing session from corrupting the rules manifest.

**User override:** Users can view their current rules in Settings → Voice → Learned Rules. They can delete any rule (sets a `deleted_at` on the structured entry, excluded from next injection). User-deleted rules are never re-extracted even if the pattern recurs.

### Draft memories — the read side

At generation time, after picking a research item to draft from, retrieve the 3 most relevant approved drafts from `draft_memories` using topic_cluster matching (no embeddings yet):

```typescript
// Simple topic-cluster retrieval (no pgvector needed)
const relevantMemories = await db
  .select()
  .from(draftMemories)
  .where(
    and(
      eq(draftMemories.userId, userId),
      eq(draftMemories.approved, true),
      eq(draftMemories.topicCluster, currentTopicCluster),
    ),
  )
  .orderBy(desc(draftMemories.createdAt))
  .limit(3);
```

Inject as positive few-shot examples (hook first lines only — not full posts, to save context window):

```
RECENT APPROVED POSTS ON THIS TOPIC (use these hooks as style reference):
- "{{memory.hook_first_line}}" ({{memory.structure_used}}, {{memory.word_count}} words)
- "{{memory.hook_first_line}}" ({{memory.structure_used}}, {{memory.word_count}} words)
```

Also retrieve the most recent 3 rejected drafts on this topic cluster:

```
RECENT REJECTED DRAFTS ON THIS TOPIC (do NOT use these patterns):
- Rejected: "{{memory.hook_first_line}}" — reason: {{rejection_reason}}
```

This is the contrastive examples approach from Yazan et al. (2025) applied without embeddings.

### Benchmarking

**The fundamental problem:** voice quality is subjective. You cannot A/B test "does this sound like me?" at 10 users. The benchmark must proxy subjective quality with measurable signals.

**Metrics to track (all from existing data):**

| Metric                      | Where                                                           | Target                                 | Alarm threshold                                                     |
| --------------------------- | --------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------- |
| Edit depth %                | `edit_events.edit_depth_pct`                                    | <30% (light polish)                    | >60% (near-rewrite)                                                 |
| Zero-edit rate              | drafts approved without edits / total approved                  | 30–50%                                 | <10% (model broken) or >70% (rubber-stamping)                       |
| Approval rate               | approved / (approved + rejected)                                | 50–80%                                 | <30% or >90%                                                        |
| Regeneration rate           | drafts regenerated before approve/reject                        | <25%                                   | >50%                                                                |
| Voice score trend           | avg `voice_score` on approved drafts over 4-week rolling window | ≥7.5                                   | <6.0                                                                |
| Rule extraction velocity    | new rules per 4 weeks                                           | 3–8 new rules/month = healthy learning | 0 rules = no learning; >20 = noise                                  |
| Edit depth by topic cluster | break down edit_depth_pct by topic                              | —                                      | Any cluster consistently >50% = voice not calibrated for that topic |
| Post-gen filter flag rate   | % of drafts with ≥1 structural flag                             | <20%                                   | >50% = prompt needs retuning                                        |

**Surfaced in the app at:** `/insights` page. Add a "Voice Quality" section showing the rolling metrics above. Not shown to users as raw numbers — framed as: "Your drafts are getting easier to approve" (zero-edit rate trend) and "Your voice is improving" (voice score trend).

**Open source tools evaluated for memory/benchmarking:**

| Tool                                        | Verdict                                                                                                                                                                                                                 |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mem0**                                    | Overkill. Excellent at relational facts ("user has a dog named Max"), not style patterns. 60s p95 latency unacceptable for interactive writing.                                                                         |
| **Letta (MemGPT)**                          | Same — designed for agent memory, not writing-style memory. Adds infra complexity for marginal gain at this scale.                                                                                                      |
| **LangMem**                                 | Too slow. Same verdict as Letta.                                                                                                                                                                                        |
| **diff-match-patch** (Google, open source)  | ✅ Use this for computing edit diffs. Gives character-level diff, line-level diff, and a patch format. Available as `diff-match-patch` on npm. Levenshtein for severity, diff-match-patch for structured diff analysis. |
| **Fastest-levenshtein**                     | ✅ Use for `edit_distance` calculation. WASM-backed, ~10× faster than pure JS.                                                                                                                                          |
| **AutoPrompter pattern** (arXiv 2504.20196) | ✅ This is the reference architecture for the offline rule extraction. Not a library — a pattern. Implemented as the Trigger.dev extraction task described above.                                                       |
| **compromise** (NLP)                        | ✅ Lightweight NLP for the post-generation scanner: sentence splitting, NER (for specificity check), contraction detection. No Python runtime needed — pure JS. ~50ms per post.                                         |

**The simplest possible benchmark you can run now:** take your last 10 edit_events and compute average `edit_depth_pct`. If it's trending down over time, the correction loop is working. This is the Wispr "zero-edit rate" metric applied to text editing.

---

## Part 3 — Image Generation Feature

### Decision: on-demand from inbox, not default

**Reasoning:**

- Not every post benefits from an image. A personal story post about a career lesson is stronger without one. A stat-heavy technical post with a data visualisation image benefits significantly.
- Generating an image for every draft adds ~$0.04 per draft to the cron cost, which at 3 drafts/day/user = ~$3.60/user/month before they've even approved anything. At scale this compounds.
- The user is in the approval loop anyway (Rule 2). Adding image generation as an action in the inbox respects the loop and keeps costs tied to user intent.
- This is also more honest: the user picks the image because they've already decided to approve the post. Generating images for rejected drafts wastes money.

**Default: off. On-demand from inbox.**
**Config: per-user setting to auto-generate for all approved drafts (opt-in).**

### Where it sits in the pipeline

```
Phase 2 cron runs → draft generated (text only) → enters inbox as today

In inbox:
  User reads draft →
    [Option A] Approve & Schedule → schedules text-only post → done
    [Option B] "Add Image" button → image generation flow → user sees preview →
      Approve with image → schedules post with image attachment → done
    [Option C] User has "auto-generate image" enabled in settings →
      image is generated and attached to draft card automatically when draft enters inbox
      (cost incurred at generation time, not approval time)
```

Option C (auto-generate) is the configurable default. Users who always want images turn it on. Default is off.

### UI changes

**Draft card additions:**

- "Add Image" button (secondary action, below the main approve/edit/reject row)
- When image is attached: thumbnail preview in the card, "Remove image" link, "Regenerate image" button
- Image type selector (shown inline): `[Single image ▾]` — dropdown with: Single image / Quote card / Stat card / Framework diagram (options tuned to LinkedIn use cases)
- The LinkedIn preview pane (right column on desktop) updates to show the post with the image as it will appear on LinkedIn

**Settings → Content → Image Generation:**

```
Image generation
[ ] Auto-generate images for all drafts in inbox (adds ~$0.04/draft)

Default image style
( ) Single image — general purpose
( ) Quote card — pull a key phrase from the post, render as text-on-background
( ) Stat card — extract the main data point and visualise it
( ) Framework diagram — for structured posts with 3–5 components

Image generator
( ) Ideogram 3.0 Turbo — best for text in images ($0.04/image)  [default]
( ) FLUX 1.1 Pro — best for photographic ($0.04/image)
( ) Auto — picks best model based on image type

[Save preferences]
```

### Image prompt generation

The image prompt is generated by the same LLM pass that scored the draft (Haiku — cheap, fast). Prompt template:

```
You are generating an image prompt for a LinkedIn post.
The post is about: {{research_item.title}}
Post hook (first line): {{draft.hook}}
Image style requested: {{user_settings.default_image_style}}

Rules for the image prompt:
- Professional, clean, suitable for B2B LinkedIn audience
- NO stock photo clichés (handshakes, lightbulbs, magnifying glasses, arrows pointing up)
- For 'quote_card': extract the most striking 8–15 word phrase from the post.
  Clean background, large readable text, no other elements.
- For 'stat_card': extract the key number from the post.
  Large number, brief label, minimal background.
- For 'framework_diagram': list the 3–5 components of the framework in the post.
  Clean diagram style, label each component.
- For 'single_image': describe a specific, concrete scene relevant to the post topic.
  NOT generic. NOT abstract. A real-world setting that a professional would recognise.
- Keep image prompt under 100 words.
- Aspect ratio: 1200×627 (1.91:1 landscape) for single/stat/framework.
  1200×1200 (1:1 square) for quote cards.

Output the image generation prompt only. No preamble.
```

### LinkedIn Image API integration

**Three-step flow (already confirmed working via w_member_social):**

```typescript
// Step 1: Initialise upload
const initResponse = await fetch(
  'https://api.linkedin.com/rest/images?action=initializeUpload',
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Linkedin-Version': '202505',
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      initializeUploadRequest: {
        owner: `urn:li:person:${personUrn}`,
      },
    }),
  }
);
const { value: { uploadUrl, image: imageUrn } } = await initResponse.json();

// Step 2: Upload image binary
await fetch(uploadUrl, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/octet-stream' },
  body: imageBuffer,  // Buffer from image generation API response
});

// Step 3: Attach to post payload
// In the posts payload, add:
content: {
  media: {
    id: imageUrn,
    title: altText,  // Generate from image prompt, 100 char max
  }
}
```

**Specs to enforce before upload:**

- Format: JPEG or PNG only. Convert if generator returns WebP.
- Size: max 5 MB. Resize/compress if over limit (use sharp npm package).
- Dimensions: 1200×627 or 1200×1200. Resize to exact dimensions.
- Aspect ratio: between 1:2.4 and 2.4:1. Any generated image within this range is accepted.

**Alt text:** Generate a brief descriptive alt text from the image prompt (Haiku, ~10 tokens). Store in `posts.image_alt_text`. Required for accessibility compliance and good practice.

### Schema additions

```sql
-- Add to draft_queue:
ALTER TABLE draft_queue ADD COLUMN image_prompt text;
ALTER TABLE draft_queue ADD COLUMN image_url text;         -- CDN URL of generated image (temp storage)
ALTER TABLE draft_queue ADD COLUMN image_style text;       -- 'single_image' | 'quote_card' | 'stat_card' | 'framework_diagram'
ALTER TABLE draft_queue ADD COLUMN image_generator text;   -- 'ideogram_3_turbo' | 'flux_1_1_pro' | 'auto'

-- Add to posts:
ALTER TABLE posts ADD COLUMN image_urn text;               -- LinkedIn image URN (from upload step)
ALTER TABLE posts ADD COLUMN image_alt_text text;
ALTER TABLE posts ADD COLUMN image_cost_cents integer;     -- cost in cents (e.g. 4 = $0.04)

-- Add to user_settings:
ALTER TABLE user_settings ADD COLUMN image_auto_generate boolean not null default false;
ALTER TABLE user_settings ADD COLUMN image_default_style text not null default 'single_image';
ALTER TABLE user_settings ADD COLUMN image_generator text not null default 'ideogram_3_turbo';
```

### Image generation API — Ideogram 3.0 Turbo (default)

```typescript
// Ideogram 3.0 Turbo — $0.04/image, best text rendering
const imageResponse = await fetch("https://api.ideogram.ai/generate", {
  method: "POST",
  headers: {
    "Api-Key": process.env.IDEOGRAM_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    image_request: {
      prompt: imagePrompt,
      aspect_ratio: style === "quote_card" ? "ASPECT_1_1" : "ASPECT_16_9",
      model: "V_3_TURBO",
      magic_prompt_option: "OFF", // We control the prompt — no auto-enhancement
    },
  }),
});
const {
  data: [{ url }],
} = await imageResponse.json();
// Download the image and convert to buffer for LinkedIn upload
```

```typescript
// FLUX 1.1 Pro via Replicate — $0.04/image, best photographic
const output = await replicate.run("black-forest-labs/flux-1.1-pro", {
  input: {
    prompt: imagePrompt,
    aspect_ratio: style === "quote_card" ? "1:1" : "16:9",
    output_format: "jpeg",
    output_quality: 90,
  },
});
```

### Cost model

| Scenario                                     | Cost/draft        | Cost/user/month (3 drafts/day) |
| -------------------------------------------- | ----------------- | ------------------------------ |
| Off (default)                                | $0                | $0                             |
| On-demand, ~30% of approved posts get images | ~$0.012/draft avg | ~$1.08                         |
| Auto-generate all inbox drafts               | ~$0.04/draft      | ~$3.60                         |
| Auto-generate + 20% regenerated              | ~$0.048/draft     | ~$4.32                         |

At $49/mo pricing, even the auto-generate scenario is under 10% of revenue per user. Acceptable. Communicate the cost transparently in Settings.

### PDF Carousel — Phase 2 (deferred)

PDF carousels are the highest-engagement LinkedIn format (6.6% engagement) but require a more complex pipeline:

- LLM plans 7–10 slide outline
- Slides rendered as HTML + Playwright screenshots OR as individual Ideogram/Recraft images
- Stitched to PDF via react-pdf or WeasyPrint
- Uploaded via Documents API (same init/upload/attach 3-step flow, different endpoint)
- Costs ~$0.32–$0.55 per carousel vs $0.04 for a single image

This is a meaningful feature but higher complexity. Build it in Stage 3, not alongside the single-image feature. Add `'carousel'` as a future image_style option — the UI can show it as "coming soon" to set expectations.

---

## Build Order

These three areas are mostly independent but share schema migrations. Suggested sequencing:

### Week 1 — Post-generation filter layer (no schema changes)

1. Implement the structural scan function in a new `src/lib/quality/scan.ts`
2. Wire it into the generate pipeline: scan runs after Haiku voice score, before inserting into draft_queue
3. Scan results stored as a JSONB column on the draft: `ai_tell_flags` (already exists in Stage 1 — extend it)
4. Update the inbox draft card to show the new flag categories

### Week 1–2 — Generation prompt overhaul

1. Update `prompts.ts` with the new thoughtful-expert frame
2. Add structural requirements block
3. Add quantitative voice measurements (requires Stage 2 voice extraction to have run — already done)
4. Add contrastive anchor (3 static AI-slop examples, hardcoded)
5. Add few-shot ordering change (representative examples first, most recent last)

### Week 2–3 — Memory and correction loop

1. Schema: `edit_events`, `voice_rules` tables, `draft_memories` column additions
2. Write path: hook into approve action, regeneration action
3. Offline extraction: Trigger.dev task
4. Read path: inject rules_markdown into generation prompt
5. Benchmarking metrics: add to `/insights` page

### Week 3–4 — Image generation

1. Schema additions to `draft_queue`, `posts`, `user_settings`
2. Image prompt generation (Haiku pass)
3. Ideogram 3.0 Turbo integration
4. LinkedIn Images API upload flow (3-step)
5. Inbox UI: "Add Image" button, thumbnail preview, image type selector
6. Settings UI: auto-generate toggle, default style, generator choice
7. FLUX 1.1 Pro as secondary option

### Not yet:

- PDF carousel (Phase 2, Stage 3)
- Member Post Analytics API integration (requires partner approval)
- pgvector RAG (Stage 4)
- EU DMA Portability API (when EU users in user base)

---

## Open Questions

1. **Image storage:** Generated images need temporary storage between generation and LinkedIn upload (LinkedIn URL from Ideogram expires in hours). Use Supabase Storage (already in stack) with a 48-hour TTL bucket. Alternatively, download immediately on generation and upload to LinkedIn synchronously. Decision: synchronous upload at approve time is simpler — no storage infra needed, and the user is already waiting for the approve action to complete.

2. **Auto-generate timing:** If `image_auto_generate = true`, images are generated when the draft enters the inbox (cron phase 2). This means the image is ready when the user opens the inbox, but costs money for drafts they reject. Alternative: generate on first inbox view (lazy). Decision: lazy generation (on first open) is better UX and avoids wasted cost. Implement as a one-time async call when the user opens a draft card with auto-generate enabled.

3. **Voice rules visibility:** Should users see their learned rules? Yes — transparency builds trust. Add a read-only "Learned rules" section to Settings → Voice Profile. Users can delete individual rules. They cannot edit rules (the LLM writes them from evidence — free-text editing would corrupt the signal).

4. **Rule manifest size:** 15 rules max is specified above. At ~50 chars/rule, that's ~750 chars of context injected into every generation prompt. Acceptable — generation context is already 2,000+ chars from voice profile. If rules grow beyond 15, keep the most-recent 15 (recency bias) rather than the most-frequent, because stylistic drift is real.

5. **Benchmark baseline:** Before shipping the correction loop, take a snapshot of current `edit_depth_pct` for the last 10 approvals. This is the baseline. Target: 30% reduction in average edit depth after 4 weeks of the correction loop running.

---

## Changelog

| Date     | Note                                                                                                      |
| -------- | --------------------------------------------------------------------------------------------------------- |
| May 2026 | Document created. Research-grounded specs for AI tell suppression, correction loop, and image generation. |
