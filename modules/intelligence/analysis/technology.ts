import "server-only";

import type { ParsedHtml } from "./parse";
import { collectAssetUrls } from "./page-signals";

/**
 * Technology detection — named explicitly in Phase 3.4's instructions
 * but not its own §9.2 bullet; a general JS-library/framework signal
 * distinct from [5 CMS] (content-management platforms) and Tracking
 * (analytics/ads tags), using the same asset-path/DOM-marker fingerprint
 * technique §9.2's CMS bullet already establishes for this pipeline
 * (see docs/sprint-3.md's deviation check for this phase).
 */

export type TechnologyMatch = {
  name: string;
  evidence: string[];
};

export type TechnologyDetectionResult = {
  detected: TechnologyMatch[];
};

type TechnologyFingerprint = {
  name: string;
  assetPatterns?: RegExp[];
  /** Cheerio selectors whose presence (`length > 0`) is evidence — DOM markers frameworks leave behind (`ng-version`, `data-reactroot`, ...). */
  domSelectors?: string[];
};

const TECHNOLOGY_FINGERPRINTS: TechnologyFingerprint[] = [
  {
    name: "jQuery",
    assetPatterns: [/jquery(?:[.-]\d[\w.]*)?(?:\.min)?\.js/i],
  },
  {
    name: "React",
    assetPatterns: [/react(-dom)?(\.production)?(\.min)?\.js/i],
    domSelectors: ["[data-reactroot]"],
  },
  {
    name: "Next.js",
    assetPatterns: [/_next\/static\//i],
    domSelectors: ["#__next", "script#__NEXT_DATA__"],
  },
  {
    name: "Vue.js",
    assetPatterns: [/vue(\.global)?(\.runtime)?(\.min)?\.js/i],
    domSelectors: ["[data-v-app]", "[data-server-rendered]"],
  },
  {
    name: "Angular",
    assetPatterns: [/angular(\.min)?\.js/i],
    domSelectors: ["[ng-version]"],
  },
  {
    name: "Bootstrap",
    assetPatterns: [/bootstrap(\.min)?\.(css|js)/i],
  },
  {
    name: "Tailwind CSS",
    assetPatterns: [/tailwind(\.min)?\.css/i],
  },
];

export function detectTechnologies($: ParsedHtml): TechnologyDetectionResult {
  const assetUrls = collectAssetUrls($);

  const detected: TechnologyMatch[] = [];

  for (const fingerprint of TECHNOLOGY_FINGERPRINTS) {
    const evidence: string[] = [];

    for (const pattern of fingerprint.assetPatterns ?? []) {
      const match = assetUrls.find((url) => pattern.test(url));
      if (match) evidence.push(`asset path: ${match}`);
    }

    for (const selector of fingerprint.domSelectors ?? []) {
      if ($(selector).length > 0) evidence.push(`dom marker: ${selector}`);
    }

    if (evidence.length > 0) {
      detected.push({ name: fingerprint.name, evidence });
    }
  }

  return { detected };
}
