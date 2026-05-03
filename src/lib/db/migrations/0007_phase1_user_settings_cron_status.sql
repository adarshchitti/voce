-- Phase 1 daily-cron observability: per-user record of the last generation run.
-- last_cron_status values: NULL (never run) | 'success_with_drafts' | 'success_no_drafts' | 'failed'
ALTER TABLE "user_settings" ADD COLUMN "last_cron_status" text;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "last_cron_at" timestamp with time zone;
