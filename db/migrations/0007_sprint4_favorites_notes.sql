CREATE TYPE "public"."favorite_status" AS ENUM('new', 'reviewing', 'qualified', 'not_fit', 'won');--> statement-breakpoint
CREATE TABLE "favorites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"status" "favorite_status" DEFAULT 'new' NOT NULL,
	"priority" integer,
	"follow_up_at" date,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"body" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "favorites_user_business_active_idx" ON "favorites" USING btree ("user_id","business_id") WHERE "favorites"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "favorites_user_status_idx" ON "favorites" USING btree ("user_id","status") WHERE "favorites"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "favorites_user_follow_up_at_idx" ON "favorites" USING btree ("user_id","follow_up_at") WHERE "favorites"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "notes_user_business_pinned_created_at_idx" ON "notes" USING btree ("user_id","business_id","pinned","created_at" DESC NULLS LAST) WHERE "notes"."deleted_at" is null;