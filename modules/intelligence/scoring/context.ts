import "server-only";

import type { PageAnalysis } from "@/modules/intelligence/analysis";

/**
 * The flattened scoring context (architecture.md §10.1's own example:
 * `{ has_ssl, has_website, cms, has_ga4, has_meta_pixel, seo.title_ok,
 * seo.h1_ok, has_sitemap, schema_present, social.count, google.rating,
 * google.review_count, ... }`). Built strictly from that named list,
 * with one deliberate omission: `social.count`. The Website Analyzer's
 * [7 Social] stage (outbound Facebook/Instagram/LinkedIn/X/TikTok/
 * YouTube link detection, architecture.md §9.2) was never implemented
 * across Phases 3.2–3.4 — there is no existing analyzer output to
 * source it from, and this phase's scope ("reuse every analyzer
 * already implemented ... do not duplicate analysis logic") rules out
 * building that stage now. See docs/sprint-3.md for the full note; this
 * is flagged there as a genuine, disclosed gap, not silently dropped.
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
  google: {
    rating: number | null;
    review_count: number | null;
  };
};

/**
 * The subset of a `businesses` row the scoring context needs — kept
 * narrow rather than the full Drizzle row type, so this module stays
 * decoupled from `db/schema` and trivially testable with plain object
 * literals (this phase's "keep the scoring engine pure and testable").
 */
export type ScoringBusinessInput = {
  websiteUrl: string | null;
  googleRating: number | null;
  googleReviewCount: number | null;
};

/**
 * Pure mapping into the flattened context — every field reads directly
 * from an already-computed analyzer stage output (Phase 3.2–3.4) or the
 * business row; nothing here re-derives or re-detects anything itself
 * ("reuse every analyzer already implemented, do not duplicate analysis
 * logic"). `analysis` is `null` when the business has no website or
 * hasn't been analyzed yet — every analysis-derived field then falls
 * back to its "no signal" value (`false`/`null`) rather than the caller
 * needing to special-case that itself; `google.rating`/`review_count`
 * still come through from the business row regardless, since those are
 * Google Business signals, independent of whether a website exists.
 */
export function buildScoringContext(
  business: ScoringBusinessInput,
  analysis: PageAnalysis | null,
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
    has_sitemap: analysis?.sitemapEvaluation.present === true,
    schema_present: (analysis?.structuredData.types.length ?? 0) > 0,
    seo: {
      title_ok:
        title?.present === true && title?.withinRecommendedLength === true,
      h1_ok: headings?.hasSingleH1 === true,
    },
    google: {
      rating: business.googleRating,
      review_count: business.googleReviewCount,
    },
  };
}
