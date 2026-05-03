ALTER TABLE "topic_subscriptions" ADD COLUMN "last_research_fetch_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "topic_subscriptions" ADD COLUMN "last_research_fetch_status" text;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "daily_research_mode" text DEFAULT 'global_pool' NOT NULL;