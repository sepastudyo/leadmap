import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { geographyPoint } from "./columns";

/**
 * architecture.md §5.2 `businesses` — GLOBAL canonical business + Place
 * Details cache:
 * id (uuid pk) · google_place_id (text unique) · name · category ·
 * phone (nullable) · website_url (nullable) · address · country · city ·
 * district (nullable) · location (geography POINT — PostGIS) ·
 * google_rating (nullable) · google_review_count (nullable) ·
 * place_summary (jsonb — permitted cached fields) · details_fetched_at
 * (nullable) · details_expires_at (nullable) · first_seen_at ·
 * updated_at
 *
 * Sprint 2 (Business Discovery) populates the identity/discovery
 * columns from Places Search: google_place_id, name, category, address,
 * country, city, district, location, google_rating, google_review_count.
 * `phone` / `website_url` / `place_summary` / `details_fetched_at` /
 * `details_expires_at` stay null until Sprint 3's Place Details
 * enrichment — the repository layer's upsert (`modules/discovery`)
 * deliberately never writes to those columns, so a Sprint 2 re-search
 * can't clobber Sprint 3 data on an existing row.
 */
export const businesses = pgTable(
  "businesses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    googlePlaceId: text("google_place_id").notNull().unique(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    phone: text("phone"),
    websiteUrl: text("website_url"),
    address: text("address").notNull(),
    country: text("country").notNull(),
    city: text("city").notNull(),
    district: text("district"),
    location: geographyPoint("location").notNull(),
    googleRating: real("google_rating"),
    googleReviewCount: integer("google_review_count"),
    placeSummary: jsonb("place_summary").notNull().default({}),
    detailsFetchedAt: timestamp("details_fetched_at", { withTimezone: true }),
    detailsExpiresAt: timestamp("details_expires_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // architecture.md §5.4
    index("businesses_location_gist_idx").using("gist", table.location),
    index("businesses_search_gin_idx").using(
      "gin",
      sql`to_tsvector('simple', ${table.name} || ' ' || ${table.category} || ' ' || ${table.city})`,
    ),
    index("businesses_country_city_district_idx").on(
      table.country,
      table.city,
      table.district,
    ),
    index("businesses_category_idx").on(table.category),
  ],
);
