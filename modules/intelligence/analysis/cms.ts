import "server-only";

import type { ParsedHtml } from "./parse";
import { collectAssetUrls } from "./page-signals";

/**
 * [5 CMS] (architecture.md §9.2: "CMS detection: WordPress/Shopify/
 * Wix/etc. via `meta[name=generator]`, server/`x-powered-by` headers,
 * and known asset-path/JS fingerprints").
 */

export type CmsMatch = {
  name: string;
  /** Human-readable evidence strings — which signal(s) matched and what value triggered it. */
  evidence: string[];
};

export type CmsDetectionResult = {
  /** Usually 0 or 1 entries; kept as an array since a page can legitimately trip more than one fingerprint (e.g. a headless-CMS-on-a-platform combo). */
  detected: CmsMatch[];
};

type CmsFingerprint = {
  name: string;
  generatorPattern?: RegExp;
  /** Presence of any of these response headers is evidence for this CMS. */
  headerNames?: string[];
  /** Tested against every collected `script`/`link`/`img` `src`/`href`. */
  assetPatterns?: RegExp[];
};

const CMS_FINGERPRINTS: CmsFingerprint[] = [
  {
    name: "WordPress",
    generatorPattern: /wordpress/i,
    assetPatterns: [/\/wp-content\//i, /\/wp-includes\//i, /\/wp-json\//i],
  },
  {
    name: "Shopify",
    generatorPattern: /shopify/i,
    headerNames: ["x-shopid", "x-shardid", "x-sorting-hat-podid"],
    assetPatterns: [/cdn\.shopify\.com/i, /\/cdn\/shop\//i],
  },
  {
    name: "Wix",
    generatorPattern: /wix\.com/i,
    headerNames: ["x-wix-request-id"],
    assetPatterns: [/static\.wixstatic\.com/i, /\/wix-code\//i],
  },
  {
    name: "Squarespace",
    generatorPattern: /squarespace/i,
    assetPatterns: [/static1\.squarespace\.com/i, /squarespace-cdn\.com/i],
  },
  {
    name: "Webflow",
    generatorPattern: /webflow/i,
    assetPatterns: [/assets-global\.website-files\.com/i, /\.webflow\.io/i],
  },
  {
    name: "Drupal",
    generatorPattern: /drupal/i,
    headerNames: ["x-drupal-cache", "x-drupal-dynamic-cache"],
    assetPatterns: [/\/sites\/default\/files\//i, /\/sites\/all\/modules\//i],
  },
  {
    name: "Joomla",
    generatorPattern: /joomla/i,
    assetPatterns: [/\/media\/jui\//i, /\/components\/com_/i],
  },
];

export function detectCms(
  $: ParsedHtml,
  headers: Record<string, string>,
): CmsDetectionResult {
  const generator = $('meta[name="generator"]').first().attr("content") ?? "";
  const assetUrls = collectAssetUrls($);

  const detected: CmsMatch[] = [];

  for (const fingerprint of CMS_FINGERPRINTS) {
    const evidence: string[] = [];

    if (fingerprint.generatorPattern?.test(generator)) {
      evidence.push(`meta generator: "${generator}"`);
    }

    for (const headerName of fingerprint.headerNames ?? []) {
      if (headers[headerName] !== undefined) {
        evidence.push(`response header: ${headerName}`);
      }
    }

    for (const pattern of fingerprint.assetPatterns ?? []) {
      const match = assetUrls.find((url) => pattern.test(url));
      if (match) evidence.push(`asset path: ${match}`);
    }

    if (evidence.length > 0) {
      detected.push({ name: fingerprint.name, evidence });
    }
  }

  return { detected };
}
