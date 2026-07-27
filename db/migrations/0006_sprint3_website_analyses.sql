CREATE TYPE "public"."website_analysis_status" AS ENUM('ok', 'partial', 'failed');--> statement-breakpoint
CREATE TABLE "website_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"url_analyzed" text NOT NULL,
	"final_url" text NOT NULL,
	"status" "website_analysis_status" NOT NULL,
	"http_status" integer,
	"ssl" jsonb NOT NULL,
	"metadata" jsonb NOT NULL,
	"schema_org" jsonb NOT NULL,
	"seo" jsonb NOT NULL,
	"cms" jsonb NOT NULL,
	"tracking" jsonb NOT NULL,
	"social" jsonb NOT NULL,
	"robots" jsonb NOT NULL,
	"sitemap" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"analyzer_version" text NOT NULL,
	"analyzed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "website_analyses_business_id_unique" UNIQUE("business_id")
);
--> statement-breakpoint
CREATE TABLE "analysis_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"analysis" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"analyzer_version" text NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "website_analyses" ADD CONSTRAINT "website_analyses_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_history" ADD CONSTRAINT "analysis_history_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analysis_history_business_captured_idx" ON "analysis_history" USING btree ("business_id","captured_at" DESC NULLS LAST);