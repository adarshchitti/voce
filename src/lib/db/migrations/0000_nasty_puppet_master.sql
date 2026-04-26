CREATE TABLE "cron_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phase" text NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_ms" integer,
	"result" json,
	"error_count" integer DEFAULT 0 NOT NULL,
	"success" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "draft_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"research_item_id" uuid,
	"draft_text" text NOT NULL,
	"hook" text NOT NULL,
	"format" text DEFAULT 'text_post' NOT NULL,
	"source_urls" text[] DEFAULT '{}',
	"voice_score" integer,
	"ai_tell_flags" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"stale_after" timestamp with time zone NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"scheduled_for" timestamp with time zone,
	"edited_text" text
);
--> statement-breakpoint
CREATE TABLE "linkedin_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text NOT NULL,
	"person_urn" text NOT NULL,
	"token_expiry" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "linkedin_tokens_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"draft_id" uuid NOT NULL,
	"linkedin_post_id" text,
	"content_snapshot" text NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"failure_reason" text,
	"manual_impressions" integer,
	"manual_reactions" integer,
	"manual_comments" integer,
	"manual_notes_updated_at" timestamp with time zone,
	"scheduled_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rejection_reasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"draft_id" uuid NOT NULL,
	"reason_code" text NOT NULL,
	"free_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"source_type" text NOT NULL,
	"published_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dedup_hash" text NOT NULL,
	"relevance_score" numeric(3, 2),
	"originality_score" numeric(3, 2),
	CONSTRAINT "research_items_url_unique" UNIQUE("url"),
	CONSTRAINT "research_items_dedup_hash_unique" UNIQUE("dedup_hash")
);
--> statement-breakpoint
CREATE TABLE "topic_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"topic_label" text NOT NULL,
	"tavily_query" text NOT NULL,
	"source_urls" text[] DEFAULT '{}',
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"cadence_mode" text DEFAULT 'daily' NOT NULL,
	"drafts_per_day" integer DEFAULT 3 NOT NULL,
	"preferred_days" text[] DEFAULT ARRAY['monday','tuesday','wednesday','thursday'] NOT NULL,
	"preferred_time" time DEFAULT '09:00' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"jitter_minutes" integer DEFAULT 15 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"raw_description" text,
	"sample_posts" text[] DEFAULT '{}',
	"sentence_length" text,
	"hook_style" text,
	"pov" text,
	"tone_markers" text[] DEFAULT '{}',
	"topics_observed" text[] DEFAULT '{}',
	"formatting_style" text,
	"user_banned_words" text[] DEFAULT '{}',
	"user_notes" text,
	"personal_context" text,
	"extracted_patterns" json,
	"calibrated" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "voice_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "draft_queue" ADD CONSTRAINT "draft_queue_research_item_id_research_items_id_fk" FOREIGN KEY ("research_item_id") REFERENCES "public"."research_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_draft_id_draft_queue_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."draft_queue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rejection_reasons" ADD CONSTRAINT "rejection_reasons_draft_id_draft_queue_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."draft_queue"("id") ON DELETE no action ON UPDATE no action;