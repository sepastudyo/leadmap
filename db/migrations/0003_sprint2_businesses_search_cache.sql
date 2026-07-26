-- `location`'s type below was hand-corrected after `drizzle-kit generate`:
-- it emits custom-type dataType() strings as a quoted identifier
-- (`"geography(Point, 4326)"`), which Postgres would try to resolve as
-- a literally-named type and fail. `db/migrations/meta/0003_snapshot.json`
-- already records the correct unquoted string, so this doesn't affect
-- future `generate` diffs.
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"google_place_id" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"phone" text,
	"website_url" text,
	"address" text NOT NULL,
	"country" text NOT NULL,
	"city" text NOT NULL,
	"district" text,
	"location" geography(Point, 4326) NOT NULL,
	"google_rating" real,
	"google_review_count" integer,
	"place_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"details_fetched_at" timestamp with time zone,
	"details_expires_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "businesses_google_place_id_unique" UNIQUE("google_place_id")
);
--> statement-breakpoint
CREATE TABLE "search_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signature" text NOT NULL,
	"params" jsonb NOT NULL,
	"place_ids" jsonb NOT NULL,
	"result_count" integer NOT NULL,
	"provider_page_tokens" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_cache_signature_unique" UNIQUE("signature")
);
--> statement-breakpoint
CREATE INDEX "businesses_location_gist_idx" ON "businesses" USING gist ("location");--> statement-breakpoint
CREATE INDEX "businesses_search_gin_idx" ON "businesses" USING gin (to_tsvector('simple', "name" || ' ' || "category" || ' ' || "city"));--> statement-breakpoint
CREATE INDEX "businesses_country_city_district_idx" ON "businesses" USING btree ("country","city","district");--> statement-breakpoint
CREATE INDEX "businesses_category_idx" ON "businesses" USING btree ("category");--> statement-breakpoint
CREATE INDEX "search_cache_expires_at_idx" ON "search_cache" USING btree ("expires_at");