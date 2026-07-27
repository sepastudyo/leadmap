import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import type {
  PersistedCms,
  PersistedMetadata,
} from "@/modules/intelligence/analysis/assemble";
import type { RobotsEvaluation } from "@/modules/intelligence/analysis/robots";
import type { SitemapEvaluation } from "@/modules/intelligence/analysis/sitemap";
import type { SocialLinksResult } from "@/modules/intelligence/analysis/social-links";
import type { SslAnalysis } from "@/modules/intelligence/analysis/ssl";
import type { StructuredDataResult } from "@/modules/intelligence/analysis/structured-data";
import type { SeoAnalysis } from "@/modules/intelligence/analysis/seo";
import type { TrackingDetectionResult } from "@/modules/intelligence/analysis/tracking";

import { businesses } from "./businesses";

/**
 * architecture.md §5.2 `website_analyses` — GLOBAL latest analysis per
 * business: `id (uuid pk)` · `business_id (fk)` · `url_analyzed` ·
 * `final_url` · `status (enum: ok|partial|failed)` · `http_status
 * (nullable)` · `ssl (jsonb)` · `metadata (jsonb — title/desc/OG)` ·
 * `schema_org (jsonb)` · `seo (jsonb)` · `cms (jsonb)` · `tracking
 * (jsonb)` · `social (jsonb)` · `robots (jsonb)` · `sitemap (jsonb)` ·
 * `content_hash` · `analyzer_version` · `analyzed_at` · `expires_at`.
 * "One current row per business" — `business_id` unique (§5.4).
 *
 * Every jsonb column is typed via `.$type<T>()` against the exact
 * shapes `modules/intelligence/analysis/assemble.ts`'s
 * `assembleAnalysis` produces, so a row read back through this schema
 * is a well-typed `AssembledAnalysis`, not `unknown` — type-only
 * imports from `modules/intelligence/analysis`, so this doesn't create
 * a runtime dependency from the schema layer on the analysis pipeline.
 */
export const websiteAnalysisStatus = pgEnum("website_analysis_status", [
  "ok",
  "partial",
  "failed",
]);

export const websiteAnalyses = pgTable("website_analyses", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id")
    .notNull()
    .unique()
    .references(() => businesses.id),
  urlAnalyzed: text("url_analyzed").notNull(),
  finalUrl: text("final_url").notNull(),
  status: websiteAnalysisStatus("status").notNull(),
  httpStatus: integer("http_status"),
  ssl: jsonb("ssl").notNull().$type<SslAnalysis>(),
  metadata: jsonb("metadata").notNull().$type<PersistedMetadata>(),
  schemaOrg: jsonb("schema_org").notNull().$type<StructuredDataResult>(),
  seo: jsonb("seo").notNull().$type<SeoAnalysis>(),
  cms: jsonb("cms").notNull().$type<PersistedCms>(),
  tracking: jsonb("tracking").notNull().$type<TrackingDetectionResult>(),
  social: jsonb("social").notNull().$type<SocialLinksResult>(),
  robots: jsonb("robots").notNull().$type<RobotsEvaluation>(),
  sitemap: jsonb("sitemap").notNull().$type<SitemapEvaluation>(),
  contentHash: text("content_hash").notNull(),
  analyzerVersion: text("analyzer_version").notNull(),
  analyzedAt: timestamp("analyzed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
