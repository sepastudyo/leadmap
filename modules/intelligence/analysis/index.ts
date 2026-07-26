import "server-only";

import { analysisTargetUrlSchema } from "@/lib/validation";

import type { FetchedResource } from "./guarded-fetch";
import { extractMetadata, type PageMetadata } from "./metadata";
import { fetchPage } from "./page";
import { parseHtml } from "./parse";
import { fetchRobotsTxt, type RobotsTxtResult } from "./robots";
import { analyzeSeo, type SeoAnalysis } from "./seo";
import { discoverSitemap, type SitemapResult } from "./sitemap";
import {
  extractOpenGraph,
  extractTwitterCard,
  type OpenGraphData,
  type TwitterCardData,
} from "./social-meta";
import {
  extractStructuredData,
  type StructuredDataResult,
} from "./structured-data";

/**
 * Website Analysis pipeline (architecture.md §9). Sprint 3 Phase 3.2
 * built [1 Acquire] (`acquireWebsite`, below — unchanged, reused, not
 * duplicated). Phase 3.3 adds [2 Parse] and the evaluation stages named
 * in its instructions: Metadata, SEO (extended with image alt coverage
 * and link statistics), and Schema/OpenGraph (extended with Twitter
 * Card). CMS detection, tracking detection, and SSL analysis — the
 * remaining named stages in §9.1/§9.2 — are explicitly excluded from
 * this phase and remain for a later one.
 */

export * from "./guarded-fetch";
export * from "./metadata";
export * from "./page";
export * from "./parse";
export * from "./robots";
export * from "./seo";
export * from "./sitemap";
export * from "./social-meta";
export * from "./ssrf-guard";
export * from "./structured-data";

export type AcquisitionResult = {
  page: FetchedResource;
  robots: RobotsTxtResult | null;
  sitemap: SitemapResult | null;
};

/**
 * Runs [1 Acquire] for a single target URL: the page itself, robots.txt,
 * and (if discoverable) the sitemap, each through the same
 * SSRF/timeout/redirect/size-guarded fetch. Page and robots.txt are
 * fetched concurrently (independent of each other); sitemap discovery
 * runs after, since it depends on robots.txt's declared sitemap URLs —
 * this keeps total latency down against the serverless time budget
 * (architecture.md §18) without changing any stage's own guarantees.
 *
 * The page fetch failing propagates — there's nothing to analyze
 * without it. robots.txt/sitemap failures don't (§9.3): those are
 * optional supplementary signals, not the page under analysis.
 */
export async function acquireWebsite(url: string): Promise<AcquisitionResult> {
  const targetUrl = analysisTargetUrlSchema.parse(url);

  const [page, robots] = await Promise.all([
    fetchPage(targetUrl),
    fetchRobotsTxt(targetUrl),
  ]);
  const sitemap = await discoverSitemap(targetUrl, robots);

  return { page, robots, sitemap };
}

export type PageAnalysis = {
  acquisition: AcquisitionResult;
  metadata: PageMetadata;
  seo: SeoAnalysis;
  openGraph: OpenGraphData;
  twitterCard: TwitterCardData;
  structuredData: StructuredDataResult;
};

/**
 * [1 Acquire] → [2 Parse] → evaluate, in one call. Fetching happens
 * exactly once, via `acquireWebsite` — every evaluation stage below is
 * a pure function over the already-fetched `acquisition.page`, per
 * instruction ("do not duplicate fetch logic"). Evaluation still runs
 * even if `acquisition.page` came back non-2xx (a 404 page has a
 * `<title>` too, and reporting that is more useful than silently
 * skipping evaluation) — only a transport-level failure (already
 * thrown by `acquireWebsite` itself) prevents this from returning a
 * result at all.
 */
export async function analyzePage(url: string): Promise<PageAnalysis> {
  const acquisition = await acquireWebsite(url);
  const $ = parseHtml(acquisition.page.body);

  const metadata = extractMetadata($, acquisition.page.finalUrl);
  const seo = analyzeSeo($, metadata, {
    finalUrl: acquisition.page.finalUrl,
    headers: acquisition.page.headers,
  });
  const openGraph = extractOpenGraph($);
  const twitterCard = extractTwitterCard($);
  const structuredData = extractStructuredData($);

  return { acquisition, metadata, seo, openGraph, twitterCard, structuredData };
}
