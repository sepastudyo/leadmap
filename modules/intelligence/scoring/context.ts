import "server-only";

import type { AssembledAnalysis } from "@/modules/intelligence/analysis";

/**
 * The flattened scoring context (architecture.md §10.1's own example:
 * `{ has_ssl, has_website, cms, has_ga4, has_meta_pixel, seo.title_ok,
 * seo.h1_ok, has_sitemap, schema_present, social.count, google.rating,
 * google.review_count, ... }`) — every named field is now populated.
 *
 * Reads from `AssembledAnalysis` — the [12 Assemble]-normalized,
 * [13 Persist]-shaped analysis (`modules/intelligence/analysis/
 * assemble.ts`), not the raw in-memory `PageAnalysis` `analyzePage`
 * returns. This is a deliberate change from how this file read prior to
 * the Sprint 3 finalization (Phase 3.5 built this against `PageAnalysis`
 * directly, since no persistence layer existed yet): architecture.md
 * §10.2 literally says "context = flatten(business + latest
 * website_analysis)" — the *persisted* analysis, singular and
 * versioned, is the actual source of truth §10 describes, not whichever
 * in-memory shape happened to be available at the time. Now that
 * `website_analyses` exists, every caller — a fresh analysis just run,
 * or a cached row read back from the database — goes through
 * `assembleAnalysis` first and hands this function the *same* shape
 * either way, so scoring never depends on which path produced it.
 */
export type ScoringContext = {
  has_ssl: boolean;
  has_website: boolean;
  cms: string | null;
  has_ga4: boolean;
  has_meta_pixel: boolean;
  has_sitemap: boolean;
  schema_present: boolean;
  seo: {
    title_ok: boolean;
    h1_ok: boolean;
  };
  social: {
    count: number;
  };
  google: {
    rating: number | null;
    review_count: number | null;
  };
};

/**
 * The subset of a `businesses` row the scoring context needs — kept
 * narrow rather than the full Drizzle row type, so this module stays
 * decoupled from `db/schema` and trivially testable with plain object
 * literals ("keep the scoring engine pure and testable").
 */
export type ScoringBusinessInput = {
  websiteUrl: string | null;
  googleRating: number | null;
  googleReviewCount: number | null;
};

/**
 * Pure mapping into the flattened context — every field reads directly
 * from the already-assembled analysis or the business row; nothing here
 * re-derives or re-detects anything itself ("reuse every analyzer
 * already implemented, do not duplicate analysis logic"). `analysis` is
 * `null` when the business has no website or hasn't been analyzed yet —
 * every analysis-derived field then falls back to its "no signal" value
 * (`false`/`0`/`null`) rather than the caller needing to special-case
 * that itself; `google.rating`/`review_count` still come through from
 * the business row regardless, since those are Google Business signals,
 * independent of whether a website exists.
 */
export function buildScoringContext(
  business: ScoringBusinessInput,
  analysis: AssembledAnalysis | null,
): ScoringContext {
  const title = analysis?.seo.title;
  const headings = analysis?.seo.headings;

  return {
    has_ssl: analysis?.ssl.httpsPresent === true,
    has_website: business.websiteUrl !== null,
    cms: analysis?.cms.detected[0]?.name ?? null,
    has_ga4:
      analysis?.tracking.detected.some(
        (match) => match.name === "Google Analytics (GA4)",
      ) === true,
    has_meta_pixel:
      analysis?.tracking.detected.some(
        (match) => match.name === "Meta Pixel",
      ) === true,
    has_sitemap: analysis?.sitemap.present === true,
    schema_present: (analysis?.schemaOrg.types.length ?? 0) > 0,
    seo: {
      title_ok:
        title?.present === true && title?.withinRecommendedLength === true,
      h1_ok: headings?.hasSingleH1 === true,
    },
    social: {
      count: analysis?.social.platformCount ?? 0,
    },
    google: {
      rating: business.googleRating,
      review_count: business.googleReviewCount,
    },
  };
}
