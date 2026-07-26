import "server-only";

import { analysisTargetUrlSchema } from "@/lib/validation";

import type { FetchedResource } from "./guarded-fetch";
import { fetchPage } from "./page";
import { fetchRobotsTxt, type RobotsTxtResult } from "./robots";
import { discoverSitemap, type SitemapResult } from "./sitemap";

/**
 * Website Analysis pipeline (architecture.md §9). This phase
 * (Sprint 3 Phase 3.2) implements only [1 Acquire] — the "Website
 * Analyzer foundation." Cheerio parsing ([2 Parse]) and every
 * evaluation stage after it (metadata, SEO, CMS, tracking, social,
 * schema/OG, SSL — [3]–[8], [11]) are later Sprint 3 phases; this only
 * fetches and normalizes raw HTTP responses for them to consume.
 */

export * from "./guarded-fetch";
export * from "./page";
export * from "./robots";
export * from "./sitemap";
export * from "./ssrf-guard";

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
