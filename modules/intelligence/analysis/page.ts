import "server-only";

import { guardedFetch, type FetchedResource } from "./guarded-fetch";

/**
 * HTML download (architecture.md §9.1 [1 Acquire] "HTTPS GET the site
 * ... → HTML + response headers"). Unlike `robots.ts`/`sitemap.ts`,
 * this doesn't swallow fetch failures — there's nothing to analyze
 * without the page itself, so the caller (`index.ts`) lets this one
 * propagate.
 */
export async function fetchPage(url: string): Promise<FetchedResource> {
  return guardedFetch(url);
}
