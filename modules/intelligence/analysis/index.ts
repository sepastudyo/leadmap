import "server-only";

import { analysisTargetUrlSchema } from "@/lib/validation";

import { detectCms, type CmsDetectionResult } from "./cms";
import type { FetchedResource } from "./guarded-fetch";
import { extractMetadata, type PageMetadata } from "./metadata";
import { fetchPage } from "./page";
import { parseHtml } from "./parse";
import {
  evaluateRobotsTxt,
  fetchRobotsTxt,
  type RobotsEvaluation,
  type RobotsTxtResult,
} from "./robots";
import { analyzeSeo, type SeoAnalysis } from "./seo";
import { analyzeSsl, type SslAnalysis } from "./ssl";
import {
  discoverSitemap,
  evaluateSitemap,
  type SitemapEvaluation,
  type SitemapResult,
} from "./sitemap";
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
import {
  detectTechnologies,
  type TechnologyDetectionResult,
} from "./technology";
import { detectTracking, type TrackingDetectionResult } from "./tracking";

/**
 * Website Analysis pipeline (architecture.md §9). Sprint 3 Phase 3.2
 * built [1 Acquire] (`acquireWebsite`, below — unchanged, reused, not
 * duplicated). Phase 3.3 added [2 Parse] and Metadata/SEO/Schema-OG
 * evaluation. Phase 3.4 adds the remaining named stages: [11 SSL]
 * (extended with security header analysis), [5 CMS], Tracking,
 * Technology, and full [9 robots.txt]/[10 sitemap.xml] directive/
 * staleness evaluation (retrieval for both shipped in Phase 3.2 — this
 * phase only adds the pure evaluation over what's already fetched).
 * Every stage below still runs through the one `acquireWebsite` fetch;
 * SSL analysis is the only stage needing a *new* connection (a
 * certificate handshake `fetch` can't expose), and even that reuses
 * `finalUrl` and the same SSRF-guarded DNS resolution rather than
 * re-fetching the page.
 */

export * from "./cms";
export * from "./guarded-fetch";
export * from "./metadata";
export * from "./page";
export * from "./parse";
export * from "./robots";
export * from "./seo";
export * from "./sitemap";
export * from "./social-meta";
export * from "./ssl";
export * from "./ssrf-guard";
export * from "./structured-data";
export * from "./technology";
export * from "./tracking";

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
  ssl: SslAnalysis;
  cms: CmsDetectionResult;
  tracking: TrackingDetectionResult;
  technology: TechnologyDetectionResult;
  robotsEvaluation: RobotsEvaluation;
  sitemapEvaluation: SitemapEvaluation;
};

/**
 * [1 Acquire] → [2 Parse] → evaluate, in one call. Fetching happens
 * exactly once, via `acquireWebsite` — every evaluation stage below is
 * a pure function over the already-fetched `acquisition.page` (or, for
 * robots/sitemap evaluation, `acquisition.robots`/`acquisition.sitemap`
 * — also already fetched), per instruction ("do not duplicate fetch
 * logic" / "do not duplicate fetches"). `analyzeSsl` is started before
 * the synchronous evaluation stages and awaited last, so its network
 * round-trip overlaps with the (cheap, in-process) work below it rather
 * than adding to the pipeline's total latency serially.
 *
 * Evaluation still runs even if `acquisition.page` came back non-2xx (a
 * 404 page has a `<title>` too, and reporting that is more useful than
 * silently skipping evaluation) — only a transport-level failure
 * (already thrown by `acquireWebsite` itself) prevents this from
 * returning a result at all.
 */
export async function analyzePage(url: string): Promise<PageAnalysis> {
  const acquisition = await acquireWebsite(url);
  const sslPromise = analyzeSsl(
    acquisition.page.finalUrl,
    acquisition.page.headers,
  );

  const $ = parseHtml(acquisition.page.body);

  const metadata = extractMetadata(
    $,
    acquisition.page.finalUrl,
    acquisition.page.headers,
  );
  const seo = analyzeSeo($, metadata, {
    finalUrl: acquisition.page.finalUrl,
    headers: acquisition.page.headers,
  });
  const openGraph = extractOpenGraph($);
  const twitterCard = extractTwitterCard($);
  const structuredData = extractStructuredData($);
  const cms = detectCms($, acquisition.page.headers);
  const tracking = detectTracking($);
  const technology = detectTechnologies($);
  const robotsEvaluation = evaluateRobotsTxt(acquisition.robots);
  const sitemapEvaluation = evaluateSitemap(acquisition.sitemap);

  const ssl = await sslPromise;

  return {
    acquisition,
    metadata,
    seo,
    openGraph,
    twitterCard,
    structuredData,
    ssl,
    cms,
    tracking,
    technology,
    robotsEvaluation,
    sitemapEvaluation,
  };
}
