ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "tell_flag_numbered_lists" text DEFAULT 'three_plus' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "tell_flag_em_dash" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "tell_flag_engagement_beg" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "tell_flag_banned_words" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "tell_flag_every_line" boolean DEFAULT true NOT NULL;