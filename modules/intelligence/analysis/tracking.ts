import "server-only";

import type { ParsedHtml } from "./parse";
import { collectAssetUrls, collectInlineScripts } from "./page-signals";

/**
 * [6 Tracking] (architecture.md §9.2: "Tracking scripts: analytics/ads/
 * heatmap tags (GA4, GTM, Meta Pixel, LinkedIn Insight, Hotjar, …) — a
 * strong maturity/spend signal"). Detected via the same two signal
 * types §9.2's flow diagram names for this stage — script `src` and,
 * for tools that self-register via an inline snippet rather than an
 * external file (GTM containers, Meta Pixel's `fbq(...)` init call),
 * inline script content.
 */

export type TrackingMatch = {
  name: string;
  evidence: string[];
};

export type TrackingDetectionResult = {
  detected: TrackingMatch[];
};

type TrackingFingerprint = {
  name: string;
  srcPatterns?: RegExp[];
  inlinePatterns?: RegExp[];
};

const TRACKING_FINGERPRINTS: TrackingFingerprint[] = [
  {
    name: "Google Analytics (GA4)",
    srcPatterns: [
      /googletagmanager\.com\/gtag\/js/i,
      /google-analytics\.com\/g\/collect/i,
    ],
    inlinePatterns: [/gtag\(\s*['"]config['"]\s*,\s*['"]G-/i],
  },
  {
    name: "Google Tag Manager",
    srcPatterns: [/googletagmanager\.com\/gtm\.js/i],
    inlinePatterns: [/GTM-[A-Z0-9]+/],
  },
  {
    name: "Meta Pixel",
    srcPatterns: [/connect\.facebook\.net\/[^"']*\/fbevents\.js/i],
    inlinePatterns: [/fbq\(\s*['"]init['"]/i],
  },
  {
    name: "LinkedIn Insight",
    srcPatterns: [/snap\.licdn\.com\/li\.lms-analytics/i],
    inlinePatterns: [/_linkedin_partner_id/i],
  },
  {
    name: "Hotjar",
    srcPatterns: [/static\.hotjar\.com/i],
    inlinePatterns: [/_hjSettings/i, /\bhjid\s*:/i],
  },
];

export function detectTracking($: ParsedHtml): TrackingDetectionResult {
  const assetUrls = collectAssetUrls($);
  const inlineScripts = collectInlineScripts($);

  const detected: TrackingMatch[] = [];

  for (const fingerprint of TRACKING_FINGERPRINTS) {
    const evidence: string[] = [];

    for (const pattern of fingerprint.srcPatterns ?? []) {
      const match = assetUrls.find((url) => pattern.test(url));
      if (match) evidence.push(`script src: ${match}`);
    }

    for (const pattern of fingerprint.inlinePatterns ?? []) {
      if (inlineScripts.some((script) => pattern.test(script))) {
        evidence.push(`inline script pattern: ${pattern.source}`);
      }
    }

    if (evidence.length > 0) {
      detected.push({ name: fingerprint.name, evidence });
    }
  }

  return { detected };
}
