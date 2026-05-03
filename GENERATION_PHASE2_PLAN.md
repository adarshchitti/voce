# Generation Pipeline — Phase 2 Plan

> Written: May 2026
> Prerequisite: Generation Phase 1 fix shipped and verified in production for at least one week
> Companion files: PLAN.md, STAGE2_PLAN.md, GENERATION_QUALITY_PLAN.md
> Status: Spec complete, not yet built

---

## 0. What Phase 1 Fixed and What's Still Wrong

Phase 1 patched the symptoms of the daily generation bug without changing the architecture. After Phase 1, daily drafts are recent (72-hour filter), per-user-relevance-judged (Haiku scores each candidate against the user's topics), priority-weighted (user-level `topic_subscriptions.priority_weight` as a deterministic multiplier), and topic-labeled correctly (judge returns the matched topic id). The voice slice mismatch between cron and quick generate is also resolved.

Phase 1 left three things unfixed because addressing them required architectural change rather than surgical patching.

The first is that the daily pipeline still pulls from a global pool of research items that were fetched and scored without any specific user in mind. Even with the Haiku judge filtering for relevance, the candidate pool itself is constrained by what the global research cron happened to fetch. If a user's topic is niche, the global pool may not contain anything relevant, and the judge can only pick from what's there. Quick generate doesn't have this problem because it calls Tavily live with the user's typed query, guaranteeing relevance by construction.

The second is that project-junction priority weights (set in the project creation wizard, stored on `series_topic_subscriptions.priority_weight`) are read by exactly one code path: the project-only "Generate Now" button. The daily cron is blind to them. As soon as users start linking topics to projects with deliberately varied priorities, they'll expect those priorities to influence daily drafts. Today that won't happen.

The third is the unreachable-low-multiplier bug in `getMatchedPriorityWeight` (`src/lib/ai/rank-research.ts`). The function initializes `let best = 3` and only takes `Math.max`. This means setting priority 1 or 2 in the UI silently behaves identically to setting priority 3, because `Math.max(3, 1) = 3`. The PRIORITY_MULTIPLIERS table includes 0.6 for priority 1 and 0.8 for priority 2, but those values are unreachable from the only code path that uses the function. Right now this bug is contained to the project-only Generate Now route, which is why it's deferred to Phase 2 rather than fixed in Phase 1, but if Phase 2 brings junction priority into the daily flow, the bug becomes user-visible across the whole product.

Phase 2 addresses all three.

---

## 1. Architectural Decision: Per-User Fresh Tavily for Daily Generation

The core change is that daily generation stops drawing from the global research_items pool as its primary source. Instead, the daily Trigger.dev task per user calls Tavily live for each of that user's active topic subscriptions, mirroring the pattern that already works for quick generate.

### Why per-user fresh fetch is the right shape

Quick generate is the existence proof. It calls Tavily with the user's typed topic and produces drafts that feel on-target. The user has explicitly confirmed this part works. Daily generation already needs to behave like quick generate, just triggered automatically per topic subscription instead of manually per typed query. This isn't speculative architecture; it's recognising that you have two paths doing the same job and only one of them works.

Per-user fetch removes the Haiku judge step from Phase 1 because relevance is no longer in question. When you ask Tavily for "AI agents in autonomous driving" and get 8 results back, those results are about that topic. The judge was working around the fact that the global pool's relevance to any specific user was incidental. With per-user fetch, the judge becomes redundant and the per-user judging cost ($0.001/user/day from Phase 1) goes away.

The argument against per-user fetch in the original PLAN.md was cost: "10 users interested in AI = 10 identical Tavily calls." That argument was correct at 1000 users and wrong at the scale you're operating at and likely to operate at for the next 6-12 months. Concrete numbers in the cost section below.

### What stays: RSS as a secondary per-user filter

Some sources are explicitly user-curated. A user who configures `source_urls: ['https://simonwillison.net/atom.xml']` on a topic is saying "I want everything from this specific feed." That's not a Tavily query, it's a subscription. RSS doesn't get easily replicated by per-user Tavily because Tavily searches the web; it doesn't subscribe to feeds.

The cleanest split is: Tavily becomes per-user (called live during daily generation), RSS stays in the global research_items pool but is filtered per-user by source_urls during ranking. The global pool table keeps existing for RSS items only. New RSS items continue to flow in via the existing Phase 1 research cron, which can be slimmed down to RSS-only.

### What changes for the Phase 1 Haiku judge

The judge as built in Phase 1 has two jobs: filter for per-user relevance and pick the best matched topic id for labeling. With per-user Tavily, both jobs change shape.

Relevance filtering becomes unnecessary because Tavily results inherit the topic by construction. We know the result came from `topic.tavily_query`, so the matched_topic_id is the topic that drove the search. No LLM call needed for matching.

What's still useful is cross-topic ranking: when a user has 4 topics, each yielding 5-10 Tavily results, picking the best 3 across topics is still a decision. But that decision is well-served by the existing originality and recency signals plus priority weights, no LLM judge required. Sort by `originality_score × user_topic_priority_multiplier × project_priority_multiplier`, take top N.

The Phase 1 judge code can be retained as a fallback for the rare case where Tavily returns zero useful results across all topics, but in steady state it doesn't run.

### Trade-offs explicitly

You're trading three things by going per-user:

You're spending more on Tavily. Hard cost, real, but small at your scale. Numbers below.

You're losing what I called "cross-pollination" earlier: the chance that an article about AI agents shows up in a developer-tools user's pool because the global cron happened to fetch it. In theory this is a feature; in practice with topic_subscriptions filtering it almost never delivered value, and your friend's experience with the global pool suggests it actively hurt by injecting near-misses.

You're tying daily generation reliability to Tavily's uptime. If Tavily has a partial outage, the cron degrades. The mitigation is fallback to filtered RSS items from the global pool when Tavily fails per-topic, which we already have in the existing research cron logic. Worst case: zero drafts that day, empty-state UI from Phase 1 catches it.

What you're not trading: voice quality, draft generation cost (those are downstream of research selection), Phase 1's priority multiplier work (it carries forward unchanged), or the empty-state UX from Phase 1.

---

## 2. New Daily Generation Flow

The pseudocode shape, replacing the Phase 1 pipeline in `src/lib/pipeline/generate.ts`:

```
runGeneratePipelineForUser(userId):
  user = getUser(userId)
  topics = getActiveTopicSubscriptions(userId)

  if topics.length == 0:
    log("no active topics"); write empty-state cron_runs entry; return

  candidates = []

  for topic in topics:
    try:
      tavily_results = fetchTavily(topic.tavily_query, recency: '72h')
      for result in tavily_results:
        candidates.push({
          ...result,
          source_topic_id: topic.id,
          source_topic_label: topic.topic_label,
          source: 'tavily',
        })
    catch (tavily_error):
      log warning; continue with next topic

  rss_items = getGlobalRSSItemsFilteredByUserSources(userId, recency: '72h')
  for item in rss_items:
    matched_topic = matchRSSItemToTopic(item, topics)  // simple keyword overlap
    candidates.push({
      ...item,
      source_topic_id: matched_topic?.id,
      source_topic_label: matched_topic?.topic_label,
      source: 'rss',
    })

  if candidates.length == 0:
    log("no research available"); write empty-state cron_runs entry; return

  // Score each candidate
  for c in candidates:
    user_topic_multiplier = PRIORITY_MULTIPLIERS[
      topics.find(t => t.id == c.source_topic_id)?.priority_weight ?? 3
    ]
    project_multiplier = computeProjectMultiplier(userId, c.source_topic_id)
    c.final_score = (c.originality_score ?? 0.5) × user_topic_multiplier × project_multiplier

  candidates.sort(desc by final_score)
  selected = candidates.slice(0, user.drafts_per_day)

  for s in selected:
    generateDraft(s, voiceProfile, ...)

  write cron_runs entry with breakdown
```

Three things to flag in this flow.

The Tavily call per topic is the new latency hotspot. Tavily basic search returns in 2-5 seconds. With 4 active topics, that's 8-20 seconds of sequential calls per user. Run them in parallel with `Promise.all` to bring it down to ~5 seconds total. Trigger.dev has no problem holding the connection for that duration.

The RSS matching to a topic is now needed because each candidate must carry a `source_topic_id` for priority weighting. Use the same simple keyword-overlap match the codebase already has, but only as a labeling step on RSS items, not as a relevance filter (Tavily candidates skip this because they already know their topic). If an RSS item matches no topic, drop it (it shouldn't be in the pool).

Originality score for Tavily-fetched items: these come fresh from Tavily and don't have an originality score yet. Phase 1 originality scoring lives in the global research cron, applied at fetch time. For Phase 2, either compute originality at Tavily-fetch time per user (one Haiku call per topic, similar to the global research cron's existing pattern) or skip originality and rank purely on priority weights. The honest answer: the originality score wasn't doing much real work even in the global pool (its scoring prompt is fairly vague), so for Phase 2 I'd skip it on Tavily-fetched items and revisit if drafts feel repetitive in practice.

---

## 3. Project-Junction Priority Integration

The `series_topic_subscriptions` junction table stores priority weights between projects and topics, with default 3 and range 1-5, same shape as `topic_subscriptions.priority_weight`. The Phase 2 daily flow integrates these as a second multiplier layer.

The function `computeProjectMultiplier(userId, topicId)` returns:

```
projects = getActiveProjectsForUser(userId)
relevant_links = projects flatMap (project =>
  project.topic_links.filter(link => link.topic_id == topicId)
)

if relevant_links.length == 0:
  return 1.0  // topic not in any project, no project bias

// Take the highest priority across all projects this topic belongs to
max_priority = max(relevant_links.map(l => l.priority_weight))
return PRIORITY_MULTIPLIERS[max_priority]
```

This composes with the user-level topic multiplier from Phase 1. Final ranking is `originality × user_topic_multiplier × project_multiplier`, both multipliers in the [0.6, 1.5] range, so the maximum priority swing is 0.6×0.6 = 0.36 down to 1.5×1.5 = 2.25 up, a 6.25× range from minimum to maximum prioritization. That's wide enough to be meaningful and narrow enough that no topic gets totally starved.

### The bug fix

In `src/lib/ai/rank-research.ts`, `getMatchedPriorityWeight` currently:

```typescript
function getMatchedPriorityWeight(item, topics) {
  let best = 3;
  for (const topic of topics) {
    if (matches(item, topic)) {
      best = Math.max(best, topic.priorityWeight);
    }
  }
  return best;
}
```

The fix:

```typescript
function getMatchedPriorityWeight(item, topics) {
  let best: number | null = null;
  for (const topic of topics) {
    if (matches(item, topic)) {
      best =
        best === null
          ? topic.priorityWeight
          : Math.max(best, topic.priorityWeight);
    }
  }
  return best ?? 3; // default only if no topic matched
}
```

This makes priority 1 and 2 reachable. Existing callers don't need changes; the function signature is unchanged.

### Why integrate junction priority in Phase 2 and not Phase 1

Phase 1 deferred junction priority because (a) the junction table was empty in production at the time of the Phase 1 design review (zero rows), so there was nothing to test against, and (b) wiring it into a daily flow that didn't yet generate project-tagged drafts meant it would have nowhere to apply.

Phase 2 wires it in because the new flow naturally generates topic-tagged drafts (every candidate has a `source_topic_id`), and any topic linked to a project naturally inherits that project's bias. Drafts don't have to be explicitly "project drafts" for the priority to apply; the topic-to-project link does the work.

There's a subtle question here about whether project-tagged drafts should also set `seriesId` on the resulting `draft_queue` row. My recommendation: no in Phase 2. A draft generated from a topic that happens to be linked to a project isn't necessarily a "project post" in the user's mind. The user explicitly clicks Generate Now on a project page when they want a project-tagged draft. The daily flow's job is to produce good drafts in the user's voice, with project priorities influencing what gets selected; the user can later assign a draft to a project from the inbox if they choose. Keep `seriesId` as an explicit user action, not an inferred attribute.

---

## 4. Schema Changes

Minimal. One optional column.

```sql
-- Optional: track when each topic was last fetched, to support
-- per-topic backoff if Tavily rate-limits or returns errors.
-- Not strictly needed for Phase 2 v1 but useful for observability.
ALTER TABLE topic_subscriptions
ADD COLUMN last_research_fetch_at timestamptz;

ALTER TABLE topic_subscriptions
ADD COLUMN last_research_fetch_status text;  -- 'success' | 'tavily_error' | 'no_results'
```

That's it. Everything else is code changes.

The global `research_items` table stays. Rows from `source_type IN ('tavily_news', 'tavily_search')` will stop being added by the new flow but the existing rows can age out naturally (74-hour staleness already in place). RSS items continue to flow in from the existing research cron. Eventually you may want to delete legacy Tavily rows or filter them out of the daily flow, but it's not blocking.

The Phase 1 cron (`src/app/api/cron/research/route.ts`) gets slimmed down to RSS-only. Tavily fetching code stays in place but is now invoked from the per-user daily generation path, not the global cron. Refactor the Tavily client into `src/lib/ai/tavily.ts` (if it isn't already a shared module) so both quick generate and daily generate use the same call site.

---

## 5. Cost Analysis

Tavily basic search pricing as of writing: $0.005/query. Tavily advanced search: $0.012/query. Use basic for daily generation; advanced is overkill for the freshness window we care about.

Sequential calls per user per day: one per active topic subscription. Most users have 3-5 active topics. Assume 4.

| Users | Daily Tavily cost | Monthly Tavily cost |
| ----- | ----------------- | ------------------- |
| 5     | $0.10             | $3                  |
| 25    | $0.50             | $15                 |
| 100   | $2.00             | $60                 |
| 500   | $10.00            | $300                |
| 1000  | $20.00            | $600                |

At your $29-49/mo target pricing, even 1000 users at $600/mo Tavily spend is 2-4% of revenue. Below 100 users, it rounds to nothing. The cost framing in the original PLAN.md was right for 10000 users and wrong for any scale you're operating at.

Removing the Phase 1 Haiku judge call saves roughly $0.001/user/day, so net per-user delta from Phase 1 to Phase 2 is approximately +$0.019/day = +$0.57/month/user in research cost. Generation cost (the actual draft-writing Sonnet call) is unchanged.

If at any point you onboard a power user with 20 active topics, that user costs $0.10/day = $3/month in Tavily alone, which is still fine but worth being aware of. Optional cost cap: limit topic_subscriptions count per user (10 is generous, 5 is realistic for actual posting habit).

---

## 6. Migration and Rollout

Phase 2 is a meaningfully larger change than Phase 1. The risk is that the daily cron is a critical path for your one active user. Roll it out carefully.

The shape of a safe rollout:

Build Phase 2 behind a per-user feature flag. Add `user_settings.daily_research_mode text default 'global_pool'` with values `'global_pool'` (current Phase 1 behavior) and `'per_user_tavily'` (new Phase 2 behavior). The pipeline branches on this flag near the top.

Ship the code with the flag defaulting to `global_pool` so existing users see no change. Flip your friend's account to `per_user_tavily` manually. Watch their drafts for a few days. If they're noticeably better and Tavily costs are within projection, flip the default to `per_user_tavily` for new users and migrate existing users one at a time with their explicit awareness.

Once `per_user_tavily` has been the default for 4 weeks with no rollback, remove the flag and delete the legacy code path. Don't let two paths live forever; the flag is a rollout tool, not a permanent fork.

This isn't paranoid. The Phase 1 fix already changed the daily cron once, and this change rewrites a larger portion of the same code. Two changes in two weeks to your most critical pipeline warrants a flag.

---

## 7. Build Order

| Step | What                                                                                                                                                                     | Risk   | Dependencies        |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ------------------- |
| 1    | Refactor Tavily client into `src/lib/ai/tavily.ts` (if not already), used by quick generate and the new daily path                                                       | Low    | None                |
| 2    | Add `daily_research_mode` flag to `user_settings`, default `global_pool`                                                                                                 | Low    | None                |
| 3    | Implement `computeProjectMultiplier` helper in `src/lib/ai/rank-research.ts`                                                                                             | Low    | None                |
| 4    | Fix `getMatchedPriorityWeight` initialization bug                                                                                                                        | Low    | None                |
| 5    | Implement new daily flow behind the flag (per-user Tavily, RSS filter, multiplier ranking, no judge)                                                                     | Medium | 1, 3, 4             |
| 6    | Add schema columns `last_research_fetch_at` and `last_research_fetch_status` to topic_subscriptions                                                                      | Low    | None                |
| 7    | Wire the new flow's per-topic Tavily calls to write the new tracking columns on success/failure                                                                          | Low    | 5, 6                |
| 8    | Extend `cron_runs.result` with the new flow's breakdown (per-topic results, RSS pool size, multiplier outcomes)                                                          | Low    | 5                   |
| 9    | Manually flip friend's account to `per_user_tavily`, observe for 1 week                                                                                                  | None   | 5                   |
| 10   | Add admin UI in Settings (or a new admin route) to view and toggle a user's research mode                                                                                | Low    | 5                   |
| 11   | Slim the existing research cron (`src/app/api/cron/research/route.ts`) to RSS-only, with the legacy Tavily path remaining as a fallback for users still on `global_pool` | Medium | 9 confirmed working |
| 12   | After 4 weeks of `per_user_tavily` as default, remove the flag and the legacy code path                                                                                  | Low    | 11                  |

Steps 1-8 are the core build, roughly 4-5 days of focused work. Step 9 is observation. Steps 10-12 are rollout and cleanup over 4-6 weeks of calendar time.

---

## 8. Testing

Unit tests for the new helpers:

- `computeProjectMultiplier` with: no projects, one project with one matching topic, one project with multiple matching topics (max wins), two projects each with the topic (max across projects wins), topic with no project link (returns 1.0).
- Fixed `getMatchedPriorityWeight` with: no matches (returns default 3), single match at priority 1 (returns 1, not 3), single match at priority 2 (returns 2), multiple matches (returns max).
- The Tavily client wrapper, mocked, with: success returning N items, timeout, 429 rate limit, malformed response.

Integration test for the new daily flow:

- Seed a user with 3 topic subscriptions at varied priorities (1, 3, 5), with one topic linked to a project at junction priority 5.
- Mock Tavily to return 5 items per topic and verify: candidate pool size, ranking order, top-N selection respects compound multipliers, output drafts have correct `source_topic_label`.
- Verify that Tavily failure on one topic doesn't break the whole run (other topics' results still feed the pool).
- Verify that all-topics-fail produces zero drafts and the right cron_runs entry, hitting the Phase 1 empty-state UX.

Quick generate regression: snapshot test on the prompt structure to confirm refactoring Tavily into a shared client doesn't change quick generate's behavior.

A/B comparison while the flag is in place: when flipping your friend, generate one day's drafts under `global_pool` and one under `per_user_tavily`, side by side, and read both. The improvement should be visible in topic match quality without doing any user research.

---

## 9. Out of Scope for Phase 2

Explicitly not in this phase:

The full feedback loop read side (using `draft_memories` as positive few-shot examples and learned `voice_rules`). Per the GENERATION_QUALITY_PLAN, this is its own multi-week build and depends on having more rejection/approval data than your current user base produces. Defer until at least 5 active users have been on the platform for 4+ weeks.

Image generation. Per the GENERATION_QUALITY_PLAN's image phase, this is additive and not gated on Phase 2.

Per-user originality scoring. Mentioned as a possible Phase 2 enhancement above but not committed; ship without it and revisit if drafts feel repetitive.

Exa.ai as an alternative research source. Already deferred to Stage 3 per `STAGE2_PLAN_UPDATES_MAY2026`. Phase 2 sticks with Tavily.

Member Post Analytics API integration. Requires Partner Program approval and isn't realistic for current scale.

Daily Intent feature. Per `STAGE2_PLAN`, deferred to Stage 3.

---

## 10. Open Questions

1. Should the per-user Tavily call use `topic_label` or `tavily_query` as the search input? Currently each topic has both. `tavily_query` is the LLM-derived search string; `topic_label` is the user's friendly name. The query is already optimized for Tavily, so use it. But if users start writing topic_labels that are themselves good search queries, the distinction may blur. Revisit if observed.

2. How many Tavily results per topic? Tavily lets you specify `max_results`. Default is 5. For daily generation feeding 3 drafts/day, fetching 5 per topic across 4 topics gives a 20-item pool, more than enough. Don't over-fetch and pay for results you'll never use.

3. Should we cache Tavily results across users for the same query? Two users both subscribed to "AI agents" might genuinely want the same fresh results, and a 1-hour cache would halve cost in that case. Worth doing if user count grows past ~25, not worth it now (added complexity for minimal savings at current scale).

4. The `source_urls` per topic for RSS subscription is currently a column on `topic_subscriptions`. Should RSS items in the global pool be filtered by exact URL match, or by a "this RSS item came from a feed in your source_urls" join? Probably the latter, but it depends on how the existing RSS ingestion writes the `research_items.url` field. Verify when implementing step 5.

5. Empty inbox UX: Phase 1 added an empty state for "nothing matched today." Phase 2 will trigger this much less often (per-user fetch almost always finds something), but the message may need adjustment when the empty state IS triggered (now it usually means a Tavily outage, not "nothing matched"). Consider differentiated empty states: "Tavily is temporarily unavailable" vs "No fresh content in your topics today."

---

## 11. Success Criteria

Phase 2 succeeds if:

- The Tavily cost projection holds within 25% (e.g., for 5 users you spend $2-4/month on Tavily for daily generation).
- Your friend's draft topic-match quality is visibly better than under Phase 1, judged by reading 1 week of drafts under each mode.
- Cron_runs success rate stays above 95% (one Tavily failure per topic is tolerable; total failure of the daily run for a user is not).
- The empty-inbox state is hit less than 10% of days for a typical user (your friend, with 3-5 active topics).
- The `getMatchedPriorityWeight` bug fix is verified to make priority 1 and 2 actually decrease the multiplier (set a junction priority to 1, observe drafts deprioritize that topic).

If any of these fail after the 4-week rollout, the flag lets you flip back to `global_pool` and reassess.

---

## Changelog

| Date     | Note                                                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| May 2026 | Document created. Phase 2 spec for per-user Tavily on daily generation, project-junction priority integration, and getMatchedPriorityWeight bug fix. Sequenced after Phase 1 surgical fix. |
