import "server-only";

import { guardedFetch, type FetchedResource } from "./guarded-fetch";
import { parseXml } from "./parse";
import type { RobotsTxtResult } from "./robots";

/**
 * Sitemap discovery + evaluation (architecture.md §9.1 stage [10]).
 * Discovery (robots.txt-declared URL(s) first, `/sitemap.xml` fallback)
 * and retrieval shipped in Phase 3.2; `evaluateSitemap` below adds the
 * URL count / staleness evaluation (§9.2 "presence, ... URL
 * count/staleness") Phase 3.4 closes — a pure function over the same
 * already-fetched body, no new fetch.
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

export type SitemapEvaluation = {
  /** Was a sitemap discovered and successfully fetched? */
  present: boolean;
  /** A `<sitemapindex>` of child sitemaps, rather than a plain `<urlset>` of pages. */
  isIndex: boolean;
  /** `<url>` entries in a plain sitemap — `0` for an index (its entries are `<sitemap>`, counted separately). */
  urlCount: number;
  /** `<sitemap>` entries in a `<sitemapindex>` — `0` for a plain sitemap. */
  childSitemapCount: number;
  /** The most recent `<lastmod>` found anywhere in the document, ISO-parsed back to its original string form. */
  mostRecentLastmod: string | null;
  /** Days between now and `mostRecentLastmod` — a staleness signal. */
  daysSinceMostRecentLastmod: number | null;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Pure evaluation over Phase 3.2's already-fetched `SitemapResult` — no
 * new fetch. `null` (none discovered) and a fetched-but-non-2xx
 * response both evaluate to `present: false`, matching how most sites
 * (no sitemap at all) should read.
 */
export function evaluateSitemap(
  sitemap: SitemapResult | null,
): SitemapEvaluation {
  if (!sitemap || !sitemap.fetched.ok) {
    return {
      present: false,
      isIndex: false,
      urlCount: 0,
      childSitemapCount: 0,
      mostRecentLastmod: null,
      daysSinceMostRecentLastmod: null,
    };
  }

  const $ = parseXml(sitemap.fetched.body);
  const isIndex = $("sitemapindex").length > 0;

  let mostRecentLastmod: string | null = null;
  let mostRecentTime = -Infinity;
  $("lastmod").each((_, element) => {
    const raw = $(element).text().trim();
    if (!raw) return;
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed) && parsed > mostRecentTime) {
      mostRecentTime = parsed;
      mostRecentLastmod = raw;
    }
  });

  return {
    present: true,
    isIndex,
    urlCount: isIndex ? 0 : $("url").length,
    childSitemapCount: isIndex ? $("sitemapindex > sitemap").length : 0,
    mostRecentLastmod,
    daysSinceMostRecentLastmod:
      mostRecentLastmod !== null
        ? Math.floor((Date.now() - mostRecentTime) / MS_PER_DAY)
        : null,
  };
}
