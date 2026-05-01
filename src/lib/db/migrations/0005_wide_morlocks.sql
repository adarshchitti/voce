CREATE TABLE "regeneration_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"draft_id" uuid,
	"instruction" text,
	"draft_text_before" text,
	"draft_text_after" text,
	"sequence_number" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "draft_queue" ADD COLUMN "regeneration_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "onboarding_completed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "regeneration_history" ADD CONSTRAINT "regeneration_history_draft_id_draft_queue_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."draft_queue"("id") ON DELETE no action ON UPDATE no action;