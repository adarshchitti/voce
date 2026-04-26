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
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

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
  sourceUrls: text("source_urls").array().default(sql`'{}'`),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const draftQueue = pgTable("draft_queue", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(), // STAGE2: change to uuid
  researchItemId: uuid("research_item_id").references(() => researchItems.id),
  draftText: text("draft_text").notNull(),
  hook: text("hook").notNull(),
  format: text("format").notNull().default("text_post"),
  sourceUrls: text("source_urls").array().default(sql`'{}'`),
  voiceScore: integer("voice_score"),
  aiTellFlags: text("ai_tell_flags"),
  status: text("status").notNull().default("pending"),
  staleAfter: timestamp("stale_after", { withTimezone: true }).notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  editedText: text("edited_text"),
});

export const rejectionReasons = pgTable("rejection_reasons", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(), // STAGE2: change to uuid
  draftId: uuid("draft_id")
    .notNull()
    .references(() => draftQueue.id),
  reasonCode: text("reason_code").notNull(),
  freeText: text("free_text"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const posts = pgTable("posts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(), // STAGE2: change to uuid
  draftId: uuid("draft_id")
    .notNull()
    .references(() => draftQueue.id),
  linkedinPostId: text("linkedin_post_id"),
  contentSnapshot: text("content_snapshot").notNull(),
  status: text("status").notNull().default("scheduled"),
  failureReason: text("failure_reason"),
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

  // Raw backup of last LLM extraction — kept for debugging, not used in prompts
  extractedPatterns: json("extracted_patterns"),
  calibrated: boolean("calibrated").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
