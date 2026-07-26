import "server-only";

import { guardedFetch, type FetchedResource } from "./guarded-fetch";
import type { RobotsTxtResult } from "./robots";

/**
 * Sitemap discovery (architecture.md §9.1 stage [10]). Tries
 * robots.txt-declared sitemap URL(s) first (the standard discovery
 * mechanism), then falls back to the conventional `/sitemap.xml`
 * location. This phase only discovers and retrieves the sitemap —
 * parsing its URL list / staleness (§9.2 "presence, ... URL
 * count/staleness") is a later Sprint 3 phase's job.
 */

export type SitemapResult = {
  /** Which URL was actually fetched — a robots.txt-declared one, or the conventional fallback. */
  discoveredUrl: string;
  fetched: FetchedResource;
};

/** `null` if no candidate URL resolved to a successful response — most
 * sites don't have a sitemap, which is a normal outcome, not a failure
 * (architecture.md §9.3). */
export async function discoverSitemap(
  siteUrl: string,
  robots: RobotsTxtResult | null,
): Promise<SitemapResult | null> {
  const candidates = [
    ...(robots?.sitemapUrls ?? []),
    new URL("/sitemap.xml", siteUrl).toString(),
  ];

  for (const candidate of candidates) {
    try {
      const fetched = await guardedFetch(candidate);
      if (fetched.ok) return { discoveredUrl: candidate, fetched };
    } catch {
      // Try the next candidate — one unreachable sitemap URL isn't fatal.
    }
  }

  return null;
}
