CREATE TABLE "content_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"arc_type" text,
	"target_posts" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"hashtags" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"goal" text,
	"target_audience" text,
	"start_date" date,
	"end_date" date,
	"post_type_preferences" text[],
	"project_source_urls" text[],
	"project_topics" text[],
	"auto_generate" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "series_topic_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"series_id" uuid NOT NULL,
	"topic_subscription_id" uuid NOT NULL,
	"priority_weight" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "series_topic_subscriptions_series_id_topic_subscription_id_unique" UNIQUE("series_id","topic_subscription_id")
);
--> statement-breakpoint
ALTER TABLE "draft_queue" ADD COLUMN "series_id" uuid;--> statement-breakpoint
ALTER TABLE "draft_queue" ADD COLUMN "series_position" integer;--> statement-breakpoint
ALTER TABLE "draft_queue" ADD COLUMN "series_context" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "series_id" uuid;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "series_position" integer;--> statement-breakpoint
ALTER TABLE "topic_subscriptions" ADD COLUMN "priority_weight" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "topic_subscriptions" ADD COLUMN "tavily_query_suggested" text;--> statement-breakpoint
ALTER TABLE "topic_subscriptions" ADD COLUMN "tavily_query_confirmed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "series_topic_subscriptions" ADD CONSTRAINT "series_topic_subscriptions_series_id_content_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."content_series"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_topic_subscriptions" ADD CONSTRAINT "series_topic_subscriptions_topic_subscription_id_topic_subscriptions_id_fk" FOREIGN KEY ("topic_subscription_id") REFERENCES "public"."topic_subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_queue" ADD CONSTRAINT "draft_queue_series_id_content_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."content_series"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_series_id_content_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."content_series"("id") ON DELETE no action ON UPDATE no action;