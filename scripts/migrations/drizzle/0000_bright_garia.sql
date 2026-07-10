CREATE TYPE "public"."analyze_job_status" AS ENUM('queued', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."analyze_method" AS ENUM('template', 'foote', 'ml');--> statement-breakpoint
CREATE TYPE "public"."purchase_status" AS ENUM('pending', 'paid', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('none', 'active', 'past_due', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."track_status" AS ENUM('rendering', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text
);
--> statement-breakpoint
CREATE TABLE "analyze_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"method" "analyze_method" NOT NULL,
	"status" "analyze_job_status" DEFAULT 'queued' NOT NULL,
	"audio_size_bytes" integer NOT NULL,
	"mime" text NOT NULL,
	"title" text NOT NULL,
	"result" jsonb,
	"error_text" text,
	"track_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "analyze_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"track_id" uuid NOT NULL,
	"job_id" uuid,
	"method" "analyze_method" NOT NULL,
	"snapshot" jsonb NOT NULL,
	"final_sections" jsonb NOT NULL,
	"num_sections_delta" integer NOT NULL,
	"total_bars_delta" integer NOT NULL,
	"name_edit_count" integer NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "free_track_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"track_id" uuid NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "free_track_claims_identifier_unique" UNIQUE("identifier")
);
--> statement-breakpoint
CREATE TABLE "presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"spec" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"track_id" uuid NOT NULL,
	"provider" text DEFAULT 'stripe' NOT NULL,
	"stripe_session_id" text,
	"stripe_payment_intent" text,
	"paypal_order_id" text,
	"status" "purchase_status" DEFAULT 'pending' NOT NULL,
	"email" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchases_paypal_order_id_unique" UNIQUE("paypal_order_id")
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_token" text NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "sessions_session_token_unique" UNIQUE("session_token")
);
--> statement-breakpoint
CREATE TABLE "tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"spec" jsonb NOT NULL,
	"status" "track_status" DEFAULT 'rendering' NOT NULL,
	"preview_url" text,
	"full_url" text,
	"duration" integer,
	"email" text,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tts_cache" (
	"cache_key" text PRIMARY KEY NOT NULL,
	"audio" "bytea" NOT NULL,
	"sample_rate" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upload_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"track_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"stripe_customer_id" text,
	"subscription_status" "subscription_status" DEFAULT 'none' NOT NULL,
	"subscription_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_stripe_customer_id_unique" UNIQUE("stripe_customer_id")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analyze_jobs" ADD CONSTRAINT "analyze_jobs_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analyze_outcomes" ADD CONSTRAINT "analyze_outcomes_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analyze_outcomes" ADD CONSTRAINT "analyze_outcomes_job_id_analyze_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."analyze_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "free_track_claims" ADD CONSTRAINT "free_track_claims_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presets" ADD CONSTRAINT "presets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analyze_jobs_identifier_status_idx" ON "analyze_jobs" USING btree ("identifier","status");--> statement-breakpoint
CREATE INDEX "analyze_outcomes_method_computed_at_idx" ON "analyze_outcomes" USING btree ("method","computed_at");--> statement-breakpoint
CREATE INDEX "rate_limits_identifier_created_at_idx" ON "rate_limits" USING btree ("identifier","created_at");--> statement-breakpoint
CREATE INDEX "upload_analyses_identifier_idx" ON "upload_analyses" USING btree ("identifier");