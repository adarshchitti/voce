CREATE TABLE "draft_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"draft_id" uuid,
	"topic_cluster" text,
	"structure_used" text,
	"approved" boolean NOT NULL,
	"hook_first_line" text,
	"word_count" integer,
	"edit_diff_summary" text,
	"edit_depth_pct" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rejection_reasons" ADD COLUMN "rejection_type" text;--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD COLUMN "avg_sentence_length_words" integer;--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD COLUMN "sentence_length_range" text;--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD COLUMN "avg_words_per_post" integer;--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD COLUMN "passive_voice_rate" text;--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD COLUMN "nominalization_rate" text;--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD COLUMN "hedging_phrases" text[];--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD COLUMN "rhetorical_questions_rate" numeric(3, 2);--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD COLUMN "personal_anecdote_rate" numeric(3, 2);--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD COLUMN "data_citation_rate" numeric(3, 2);--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD COLUMN "paragraph_style" text;--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD COLUMN "hook_examples" text[];--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD COLUMN "never_patterns" text[];--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD COLUMN "post_structure_template" text;--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD COLUMN "signature_phrases" text[];--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD COLUMN "generation_guidance" text;--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD COLUMN "calibration_quality" text;--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD COLUMN "sample_post_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD COLUMN "emoji_contexts" text[];--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD COLUMN "emoji_examples" text[];--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD COLUMN "emoji_never_override" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "draft_memories" ADD CONSTRAINT "draft_memories_draft_id_draft_queue_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."draft_queue"("id") ON DELETE no action ON UPDATE no action;