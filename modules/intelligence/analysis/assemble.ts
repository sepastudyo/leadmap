import "server-only";
import crypto from "node:crypto";

import {
  ANALYZER_VERSION,
  WEBSITE_ANALYSIS_TTL_DAYS,
} from "@/config/constants";
import { assembledAnalysisSchema } from "@/lib/validation";

import type { CmsDetectionResult } from "./cms";
import type { PageMetadata } from "./metadata";
import type { RobotsEvaluation } from "./robots";
import type { SeoAnalysis } from "./seo";
import type { SitemapEvaluation } from "./sitemap";
import type { SocialLinksResult } from "./social-links";
import type { OpenGraphData, TwitterCardData } from "./social-meta";
import type { SslAnalysis } from "./ssl";
import type { StructuredDataResult } from "./structured-data";
import type { TechnologyDetectionResult } from "./technology";
import type { TrackingDetectionResult } from "./tracking";
import type { PageAnalysis } from "./types";

/**
 * [12 Assemble] (architecture.md §9.1 "normalize → validate (Zod) →
 * content_hash → analyzer_version"). Pure — takes an already-computed
 * `PageAnalysis` (Phase 3.2–3.5's pipeline, never re-fetched or
 * re-derived here) and reshapes it into the `website_analyses` row
 * shape architecture.md §5.2 specifies:
 *
 * `ssl (jsonb)` · `metadata (jsonb — title/desc/OG)` · `schema_org
 * (jsonb)` · `seo (jsonb)` · `cms (jsonb)` · `tracking (jsonb)` ·
 * `social (jsonb)` · `robots (jsonb)` · `sitemap (jsonb)` ·
 * `content_hash` · `analyzer_version`.
 *
 * Two deliberate reshaping decisions, both because §5.2's column list
 * doesn't have a 1:1 slot for everything `PageAnalysis` carries:
 * - `metadata`'s own description is "title/desc/OG" — so this column
 *   holds `PageMetadata` merged with `openGraph`/`twitterCard`, not
 *   just `PageMetadata` alone (Twitter Card has been treated as part of
 *   the same "social preview metadata" concern as OG since Phase 3.3).
 * - `technology` detection (Phase 3.4, an elaboration not itself named
 *   in §9.2) has no column of its own — it's folded into `cms`
 *   alongside `detected`, rather than inventing a new column beyond
 *   what architecture.md's dictionary specifies.
 */

export type PersistedMetadata = PageMetadata & {
  openGraph: OpenGraphData;
  twitterCard: TwitterCardData;
};

export type PersistedCms = {
  detected: CmsDetectionResult["detected"];
  technology: TechnologyDetectionResult;
};

export type WebsiteAnalysisStatus = "ok" | "partial" | "failed";

export type AssembledAnalysis = {
  urlAnalyzed: string;
  finalUrl: string;
  status: WebsiteAnalysisStatus;
  httpStatus: number | null;
  ssl: SslAnalysis;
  metadata: PersistedMetadata;
  schemaOrg: StructuredDataResult;
  seo: SeoAnalysis;
  cms: PersistedCms;
  tracking: TrackingDetectionResult;
  social: SocialLinksResult;
  robots: RobotsEvaluation;
  sitemap: SitemapEvaluation;
  contentHash: string;
  analyzerVersion: string;
  analyzedAt: Date;
  expiresAt: Date;
};

/**
 * architecture.md §9.3 "a failing stage yields status = partial rather
 * than failing the whole analysis". By the time a `PageAnalysis` exists
 * at all, the page fetch itself already succeeded in the transport
 * sense (a total fetch failure throws inside `acquireWebsite` and never
 * reaches here — see `types.ts`'s file comment) — so "partial" here
 * means a *specific* stage degraded, not the whole run: a non-2xx page
 * response, a genuinely unreachable robots.txt, or an HTTPS site whose
 * certificate handshake failed.
 *
 * Sitemap unreachability is deliberately **not** included, even though
 * `acquisition.sitemap === null` looks parallel to
 * `acquisition.robots === null` — it isn't. `robots.ts`'s `null` only
 * happens on an actual fetch exception (a real degradation);
 * `sitemap.ts`'s `discoverSitemap` collapses "no sitemap exists (404 on
 * every candidate)" and "genuinely unreachable" into the same `null`
 * result, and that file's own docstring calls this outcome "normal,
 * not a failure" — most sites simply don't have one. Treating it as
 * "partial" would have made that status the overwhelming common case
 * rather than a meaningful signal (confirmed live: both `example.com`
 * and `github.com` return `sitemap: null` today, for exactly that
 * reason, not because either is unreachable).
 *
 * "failed" is a valid `status` value architecture.md names but isn't
 * produced here — it's reserved for a caller that catches a total
 * `acquireWebsite`/`analyzePage` failure and wants to persist a minimal
 * row of its own; no such caller exists yet.
 */
function deriveStatus(analysis: PageAnalysis): "ok" | "partial" {
  const pageOk = analysis.acquisition.page.ok;
  const robotsFailed = analysis.acquisition.robots === null;
  const sslFailed =
    analysis.ssl.httpsPresent && analysis.ssl.certificate === null;

  return !pageOk || robotsFailed || sslFailed ? "partial" : "ok";
}

/**
 * Recursively sorts object keys before serializing — plain
 * `JSON.stringify` is stable across calls in practice (V8 preserves
 * insertion order), but `content_hash` existing specifically so "a
 * re-run can tell whether anything actually changed" (§9.3) deserves a
 * hash that depends only on *content*, not on incidental key-insertion
 * order this module happens to construct objects in.
 */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
    );
    return `{${entries
      .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function computeContentHash(content: Record<string, unknown>): string {
  return crypto
    .createHash("sha256")
    .update(stableStringify(content))
    .digest("hex");
}

export function assembleAnalysis(analysis: PageAnalysis): AssembledAnalysis {
  const metadata: PersistedMetadata = {
    ...analysis.metadata,
    openGraph: analysis.openGraph,
    twitterCard: analysis.twitterCard,
  };
  const cms: PersistedCms = {
    detected: analysis.cms.detected,
    technology: analysis.technology,
  };

  const content = {
    ssl: analysis.ssl,
    metadata,
    schemaOrg: analysis.structuredData,
    seo: analysis.seo,
    cms,
    tracking: analysis.tracking,
    social: analysis.social,
    robots: analysis.robotsEvaluation,
    sitemap: analysis.sitemapEvaluation,
  };

  const analyzedAt = new Date();
  const expiresAt = new Date(
    analyzedAt.getTime() + WEBSITE_ANALYSIS_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  const assembled: AssembledAnalysis = {
    urlAnalyzed: analysis.acquisition.page.requestedUrl,
    finalUrl: analysis.acquisition.page.finalUrl,
    status: deriveStatus(analysis),
    httpStatus: analysis.acquisition.page.status,
    ...content,
    contentHash: computeContentHash(content),
    analyzerVersion: ANALYZER_VERSION,
    analyzedAt,
    expiresAt,
  };

  assembledAnalysisSchema.parse(assembled);

  return assembled;
}
