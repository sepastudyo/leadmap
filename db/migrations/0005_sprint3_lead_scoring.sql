CREATE TABLE "scoring_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"expression" jsonb NOT NULL,
	"weight" numeric NOT NULL,
	"max_points" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scoring_rules_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "scoring_rulesets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer NOT NULL,
	"label" text NOT NULL,
	"rule_keys" jsonb NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scoring_rulesets_version_unique" UNIQUE("version")
);
--> statement-breakpoint
CREATE TABLE "lead_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"total" integer NOT NULL,
	"breakdown" jsonb NOT NULL,
	"ruleset_version" integer NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_scores_business_id_unique" UNIQUE("business_id")
);
--> statement-breakpoint
ALTER TABLE "lead_scores" ADD CONSTRAINT "lead_scores_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_scores_total_idx" ON "lead_scores" USING btree ("total" DESC NULLS LAST);