CREATE TYPE "public"."ai_result_type" AS ENUM('audit', 'opportunity');--> statement-breakpoint
CREATE TABLE "ai_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"type" "ai_result_type" NOT NULL,
	"provider" "ai_provider" NOT NULL,
	"prompt_version" text NOT NULL,
	"input_hash" text NOT NULL,
	"output" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_results_user_business_type_input_hash_key" UNIQUE("user_id","business_id","type","input_hash")
);
--> statement-breakpoint
ALTER TABLE "ai_results" ADD CONSTRAINT "ai_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_results" ADD CONSTRAINT "ai_results_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;