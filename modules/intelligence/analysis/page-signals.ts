import "server-only";

import type { ParsedHtml } from "./parse";

/**
 * Signal-extraction helpers shared by the fingerprint-based evaluation
 * stages ([5 CMS], Tracking, Technology — architecture.md §9.2 "known
 * asset-path/JS fingerprints" and "... via script src"). Collecting
 * asset URLs or inline script text is identical work across all three
 * stages; factored out once so a fix to *how* signals are gathered
 * doesn't have to happen in three places.
 */

/** Every `src`/`href` value from script, stylesheet, and image tags — where CMS/technology asset-path fingerprints live. */
export function collectAssetUrls($: ParsedHtml): string[] {
  const urls: string[] = [];
  $("script[src], link[href], img[src]").each((_, element) => {
    const value = $(element).attr("src") ?? $(element).attr("href");
    if (value) urls.push(value);
  });
  return urls;
}

/** The text content of every inline (`src`-less) `<script>` — where tracking snippets (`gtag(...)`, `fbq(...)`, ...) live. */
export function collectInlineScripts($: ParsedHtml): string[] {
  const scripts: string[] = [];
  $("script:not([src])").each((_, element) => {
    const text = $(element).text();
    if (text.trim()) scripts.push(text);
  });
  return scripts;
}
