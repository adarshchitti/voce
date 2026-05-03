import {
  pgTable,
  text,
  uuid,
  boolean,
  integer,
  numeric,
  timestamp,
  time,
  json,
  date,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

export const researchItems = pgTable("research_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  url: text("url").notNull().unique(),
  title: text("title").notNull(),
  summary: text("summary"),
  sourceType: text("source_type").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  dedupHash: text("dedup_hash").notNull().unique(),
  relevanceScore: numeric("relevance_score", { precision: 3, scale: 2 }),
  originalityScore: numeric("originality_score", { precision: 3, scale: 2 }),
});

export const topicSubscriptions = pgTable("topic_subscriptions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(), // STAGE2: change to uuid
  topicLabel: text("topic_label").notNull(),
  tavilyQuery: text("tavily_query").notNull(),
  priorityWeight: integer("priority_weight").notNull().default(3),
  tavilyQuerySuggested: text("tavily_query_suggested"),
  tavilyQueryConfirmed: boolean("tavily_query_confirmed").notNull().default(false),
  sourceUrls: text("source_urls").array().default(sql`'{}'`),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contentSeries = pgTable("content_series", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(), // STAGE2: change to uuid to match auth.uid()
  title: text("title").notNull(),
  description: text("description"),
  arcType: text("arc_type"),
  targetPosts: integer("target_posts"),
  status: text("status").notNull().default("active"),
  hashtags: text("hashtags").array(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  goal: text("goal"),
  targetAudience: text("target_audience"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  postTypePreferences: text("post_type_preferences").array(),
  projectSourceUrls: text("project_source_urls").array(),
  projectTopics: text("project_topics").array(),
  autoGenerate: boolean("auto_generate").notNull().default(true),
});

export const seriesTopicSubscriptions = pgTable(
  "series_topic_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seriesId: uuid("series_id")
      .notNull()
      .references(() => contentSeries.id),
    topicSubscriptionId: uuid("topic_subscription_id")
      .notNull()
      .references(() => topicSubscriptions.id),
    priorityWeight: integer("priority_weight").notNull().default(3),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueSeriesTopic: unique().on(table.seriesId, table.topicSubscriptionId),
  }),
);

export const draftQueue = pgTable("draft_queue", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(), // STAGE2: change to uuid
  researchItemId: uuid("research_item_id").references(() => researchItems.id),
  topicSubscriptionId: uuid("topic_subscription_id").references(() => topicSubscriptions.id),
  topicLabel: text("topic_label"),
  seriesId: uuid("series_id").references(() => contentSeries.id),
  seriesPosition: integer("series_position"),
  seriesContext: text("series_context"),
  draftText: text("draft_text").notNull(),
  hook: text("hook").notNull(),
  format: text("format").notNull().default("text_post"),
  hashtags: text("hashtags").array().default(sql`'{}'`),
  sourceUrls: text("source_urls").array().default(sql`'{}'`),
  voiceScore: integer("voice_score"),
  aiTellFlags: text("ai_tell_flags"),
  status: text("status").notNull().default("pending"),
  regenerationCount: integer("regeneration_count").notNull().default(0),
  staleAfter: timestamp("stale_after", { withTimezone: true }).notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  editedText: text("edited_text"),
  structureTemplateId: text("structure_template_id"),
  // which of the 5 structure templates was used — see src/lib/ai/structure-templates.ts
  source: text("source").notNull().default("cron"),
  // 'cron' | 'quick_generate' | 'onboarding'
});

export const regenerationHistory = pgTable("regeneration_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(), // STAGE2: change to uuid to match auth.uid()
  draftId: uuid("draft_id").references(() => draftQueue.id),
  instruction: text("instruction"),
  draftTextBefore: text("draft_text_before"),
  draftTextAfter: text("draft_text_after"),
  sequenceNumber: integer("sequence_number").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rejectionReasons = pgTable("rejection_reasons", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(), // STAGE2: change to uuid
  draftId: uuid("draft_id")
    .notNull()
    .references(() => draftQueue.id),
  reasonCode: text("reason_code").notNull(),
  // Valid reason_code values:
  // Voice: 'wrong_tone' | 'too_formal' | 'too_casual' | 'too_listy' | 'too_long' | 'too_short' | 'sounds_like_ai' | 'wrong_execution'
  // Research: 'wrong_topic' | 'not_interesting' | 'factually_off'
  // Other: 'other'
  rejectionType: text("rejection_type"),
  // 'voice' | 'research' | 'other'
  freeText: text("free_text"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const posts = pgTable("posts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(), // STAGE2: change to uuid
  draftId: uuid("draft_id")
    .notNull()
    .references(() => draftQueue.id),
  seriesId: uuid("series_id").references(() => contentSeries.id),
  seriesPosition: integer("series_position"),
  linkedinPostId: text("linkedin_post_id"),
  contentSnapshot: text("content_snapshot").notNull(),
  status: text("status").notNull().default("scheduled"),
  failureReason: text("failure_reason"),
  manualImpressions: integer("manual_impressions"),
  manualReactions: integer("manual_reactions"),
  manualComments: integer("manual_comments"),
  manualNotesUpdatedAt: timestamp("manual_notes_updated_at", { withTimezone: true }),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const voiceProfiles = pgTable("voice_profiles", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull().unique(), // STAGE2: change to uuid
  rawDescription: text("raw_description"),
  samplePosts: text("sample_posts").array().default(sql`'{}'`),

  // LLM-extracted fields — auto-populated when sample posts are analysed
  // Each field is independently updatable without re-running full extraction
  sentenceLength: text("sentence_length"),
  // 'short' | 'medium' | 'long'
  hookStyle: text("hook_style"),
  // 'question' | 'bold_claim' | 'personal_story' | 'data_point' | 'contrarian'
  pov: text("pov"),
  // 'first_person_singular' | 'first_person_plural' | 'third_person'
  toneMarkers: text("tone_markers").array().default(sql`'{}'`),
  // e.g. ['direct', 'contrarian', 'data-driven']
  topicsObserved: text("topics_observed").array().default(sql`'{}'`),
  formattingStyle: text("formatting_style"),
  // 'emoji_heavy' | 'emoji_light' | 'no_emoji'

  // User-controlled overrides — never touched by LLM extraction
  userBannedWords: text("user_banned_words").array().default(sql`'{}'`),
  // User adds words/phrases they never want in their posts
  userNotes: text("user_notes"),
  // Freetext override: "I never use bullet lists. I always end on a question."
  personalContext: text("personal_context"),
  // User-written background used for "Add personal angle" draft personalization

  // Raw backup of last LLM extraction — kept for debugging, not used in prompts
  extractedPatterns: json("extracted_patterns"),
  calibrated: boolean("calibrated").notNull().default(false),
  // Quantitative stylometric columns (Pass 1 extraction output)
  avgSentenceLengthWords: integer("avg_sentence_length_words"),
  sentenceLengthRange: text("sentence_length_range"),
  // e.g. "6-18"
  avgWordsPerPost: integer("avg_words_per_post"),
  passiveVoiceRate: text("passive_voice_rate"),
  // e.g. "~5% of sentences"
  nominalizationRate: text("nominalization_rate"),
  // 'low' | 'medium' | 'high'
  hedgingPhrases: text("hedging_phrases").array(),
  // actual phrases found e.g. ["I think", "worth noting"]
  rhetoricalQuestionsRate: numeric("rhetorical_questions_rate", { precision: 3, scale: 2 }),
  personalAnecdoteRate: numeric("personal_anecdote_rate", { precision: 3, scale: 2 }),
  dataCitationRate: numeric("data_citation_rate", { precision: 3, scale: 2 }),
  paragraphStyle: text("paragraph_style"),
  // 'single_line' | 'two_three_lines' | 'multi_paragraph' | 'mixed'
  hookExamples: text("hook_examples").array(),
  // up to 5 real first lines from sample posts
  neverPatterns: text("never_patterns").array(),
  // synthesized negative space e.g. ["never uses rhetorical questions", "never ends with a CTA"]

  // Post-level structural template (extracted pattern, not a stat)
  postStructureTemplate: text("post_structure_template"),
  // e.g. "Opens with one bold statement. Develops with 2-3 short paragraphs of reasoning. Closes with a direct takeaway, no CTA."

  // Vocabulary fingerprint
  signaturePhrases: text("signature_phrases").array(),
  // top recurring 2-3 word n-grams from sample posts

  // Pass 2 synthesis output — injected directly into generation prompts
  generationGuidance: text("generation_guidance"),
  // prose block synthesized from all quantitative data

  // Calibration quality (additive — calibrated boolean remains unchanged)
  calibrationQuality: text("calibration_quality"),
  // 'uncalibrated' | 'partial' | 'mostly' | 'full'
  samplePostCount: integer("sample_post_count").default(0),
  // updated at every extraction run

  // Emoji behavior
  emojiContexts: text("emoji_contexts").array(),
  // e.g. ['sentence_starter', 'emphasis', 'closer']
  emojiExamples: text("emoji_examples").array(),
  // actual emojis observed e.g. ['→', '⚡']
  emojiNeverOverride: boolean("emoji_never_override").default(false),
  // user hard toggle: never use emojis
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const draftMemories = pgTable("draft_memories", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(), // STAGE2: change to uuid to match auth.uid()
  draftId: uuid("draft_id").references(() => draftQueue.id),
  topicCluster: text("topic_cluster"),
  structureUsed: text("structure_used"),
  // e.g. 'personal_story' | 'data_point_hook' | 'framework' | 'news_reaction'
  approved: boolean("approved").notNull(),
  hookFirstLine: text("hook_first_line"),
  // first line of the draft as generated
  wordCount: integer("word_count"),
  editDiffSummary: text("edit_diff_summary"),
  // Haiku-generated summary of what changed if user edited before approving
  editDepthPct: integer("edit_depth_pct"),
  // 0-100, percentage of content that changed
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DraftMemory = InferSelectModel<typeof draftMemories>;
export type NewDraftMemory = InferInsertModel<typeof draftMemories>;
export type RegenerationHistory = typeof regenerationHistory.$inferSelect;
export type NewRegenerationHistory = typeof regenerationHistory.$inferInsert;
export type ContentSeries = InferSelectModel<typeof contentSeries>;
export type NewContentSeries = InferInsertModel<typeof contentSeries>;
export type SeriesTopicSubscription = InferSelectModel<typeof seriesTopicSubscriptions>;
export type NewSeriesTopicSubscription = InferInsertModel<typeof seriesTopicSubscriptions>;

export const linkedinTokens = pgTable("linkedin_tokens", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull().unique(), // STAGE2: change to uuid
  accessToken: text("access_token").notNull(),
  personUrn: text("person_urn").notNull(),
  tokenExpiry: timestamp("token_expiry", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userSettings = pgTable("user_settings", {
  userId: text("user_id").primaryKey(), // STAGE2: change to uuid
  cadenceMode: text("cadence_mode").notNull().default("daily"),
  draftsPerDay: integer("drafts_per_day").notNull().default(3),
  preferredDays: text("preferred_days")
    .array()
    .notNull()
    .default(sql`ARRAY['monday','tuesday','wednesday','thursday']`),
  preferredTime: time("preferred_time").notNull().default("09:00"),
  timezone: text("timezone").notNull().default("UTC"),
  jitterMinutes: integer("jitter_minutes").notNull().default(15),
  // AI tell scanner sensitivity settings
  // Controls which patterns trigger warnings in the inbox
  tellFlagNumberedLists: text("tell_flag_numbered_lists").notNull().default("three_plus"),
  // 'always' | 'three_plus' | 'never'
  // three_plus = only flag if more than 3 items in the list (default)
  tellFlagEmDash: boolean("tell_flag_em_dash").notNull().default(true),
  // Flag em dash overuse (more than once per post)
  tellFlagEngagementBeg: boolean("tell_flag_engagement_beg").notNull().default(true),
  // Flag "what do you think? drop a comment" style endings
  tellFlagBannedWords: boolean("tell_flag_banned_words").notNull().default(true),
  // Flag words from the banned words list (delve, leverage etc)
  tellFlagEveryLine: boolean("tell_flag_every_line").notNull().default(true),
  // Flag when every sentence is on its own line (AI accordion)
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cronRuns = pgTable("cron_runs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  phase: text("phase").notNull(),
  ranAt: timestamp("ran_at", { withTimezone: true }).notNull().defaultNow(),
  durationMs: integer("duration_ms"),
  result: json("result"),
  errorCount: integer("error_count").notNull().default(0),
  success: boolean("success").notNull().default(true),
});

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().unique(), // STAGE2: change to uuid to match auth.uid()
  stripeCustomerId: text("stripe_customer_id").notNull().unique(),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  status: text("status").notNull().default("trialing"),
  // 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete'
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Subscription = InferSelectModel<typeof subscriptions>;
export type NewSubscription = InferInsertModel<typeof subscriptions>;
