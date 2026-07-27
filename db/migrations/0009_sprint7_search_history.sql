CREATE TABLE "search_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"search_cache_id" uuid NOT NULL,
	"searched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_history_user_search_cache_key" UNIQUE("user_id","search_cache_id")
);
--> statement-breakpoint
ALTER TABLE "search_history" ADD CONSTRAINT "search_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_history" ADD CONSTRAINT "search_history_search_cache_id_search_cache_id_fk" FOREIGN KEY ("search_cache_id") REFERENCES "public"."search_cache"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "search_history_user_searched_at_idx" ON "search_history" USING btree ("user_id","searched_at" DESC NULLS LAST);