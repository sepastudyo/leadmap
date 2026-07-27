import "server-only";

import { resolveUrl } from "./metadata";
import type { ParsedHtml } from "./parse";

/**
 * [7 Social] (architecture.md §9.2: "Social links: outbound Facebook/
 * Instagram/LinkedIn/X/TikTok/YouTube links; dedupe + validate; flag
 * missing majors"). This stage was never implemented across Phases
 * 3.2–3.4 — a gap discovered while building the Lead Score engine
 * (Phase 3.5), whose §10.1 context example names `social.count`. This
 * closes it.
 *
 * All six platforms §9.2 names are covered, including TikTok — not
 * separately called out in this pass's own instructions, but named in
 * the exact same architecture.md sentence as the other five, and
 * "flag missing majors" is meaningless if one of the majors is silently
 * excluded from detection.
 *
 * Pure evaluation over the already-parsed page and Phase 3.2's already-
 * resolved `finalUrl` — no fetching, no browser automation, and reuses
 * `metadata.ts`'s `resolveUrl` rather than a second relative-URL
 * resolver.
 */

type PlatformKey =
  "facebook" | "instagram" | "linkedin" | "x" | "tiktok" | "youtube";

const PLATFORM_KEYS: PlatformKey[] = [
  "facebook",
  "instagram",
  "linkedin",
  "x",
  "tiktok",
  "youtube",
];

type PlatformRule = {
  key: PlatformKey;
  hostPatterns: RegExp[];
  /** Path patterns that disqualify an otherwise host-matching link — share
   * widgets, intent links, or raw video embeds rather than a genuine
   * outbound profile link (§9.2 "validate"). */
  excludePathPatterns?: RegExp[];
};

const PLATFORM_RULES: PlatformRule[] = [
  {
    key: "facebook",
    hostPatterns: [
      /(^|\.)facebook\.com$/i,
      /(^|\.)fb\.com$/i,
      /(^|\.)fb\.me$/i,
    ],
    excludePathPatterns: [/^\/sharer/i, /^\/share\.php/i, /^\/dialog\//i],
  },
  {
    key: "instagram",
    hostPatterns: [/(^|\.)instagram\.com$/i],
  },
  {
    key: "linkedin",
    hostPatterns: [/(^|\.)linkedin\.com$/i],
    excludePathPatterns: [/^\/sharing\//i, /^\/shareArticle/i],
  },
  {
    key: "x",
    hostPatterns: [/(^|\.)x\.com$/i, /(^|\.)twitter\.com$/i],
    excludePathPatterns: [/^\/intent\//i, /^\/share/i],
  },
  {
    key: "tiktok",
    hostPatterns: [/(^|\.)tiktok\.com$/i],
    excludePathPatterns: [/^\/share\//i],
  },
  {
    key: "youtube",
    // youtu.be is deliberately excluded — it's a video-shortlink domain,
    // never a channel/profile URL, so it can't carry a "presence" signal.
    hostPatterns: [/(^|\.)youtube\.com$/i],
    excludePathPatterns: [/^\/watch$/i, /^\/embed\//i, /^\/shorts\//i],
  },
];

function classifyLink(url: URL): PlatformKey | null {
  for (const rule of PLATFORM_RULES) {
    if (!rule.hostPatterns.some((pattern) => pattern.test(url.hostname))) {
      continue;
    }
    if (
      rule.excludePathPatterns?.some((pattern) => pattern.test(url.pathname))
    ) {
      continue;
    }
    return rule.key;
  }
  return null;
}

export type SocialLinksResult = {
  facebook: string | null;
  instagram: string | null;
  linkedin: string | null;
  x: string | null;
  tiktok: string | null;
  youtube: string | null;
  /** Count of the six majors present (0–6) — architecture.md §10.1's `social.count`. */
  platformCount: number;
  /** Platform keys with no detected link — §9.2 "flag missing majors". */
  missingMajors: PlatformKey[];
};

/**
 * Every `<a href>` on the page is resolved to an absolute URL and
 * classified by hostname/path. The **first** valid link found per
 * platform wins (§9.2 "dedupe") — a footer and a header link to the
 * same Facebook page shouldn't count as two signals.
 */
export function extractSocialLinks(
  $: ParsedHtml,
  finalUrl: string,
): SocialLinksResult {
  const byPlatform = new Map<PlatformKey, string>();

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    const resolved = resolveUrl(href, finalUrl);
    if (!resolved) return;

    let parsed: URL;
    try {
      parsed = new URL(resolved);
    } catch {
      return;
    }

    const platform = classifyLink(parsed);
    if (!platform || byPlatform.has(platform)) return;

    byPlatform.set(platform, resolved);
  });

  const missingMajors = PLATFORM_KEYS.filter((key) => !byPlatform.has(key));

  return {
    facebook: byPlatform.get("facebook") ?? null,
    instagram: byPlatform.get("instagram") ?? null,
    linkedin: byPlatform.get("linkedin") ?? null,
    x: byPlatform.get("x") ?? null,
    tiktok: byPlatform.get("tiktok") ?? null,
    youtube: byPlatform.get("youtube") ?? null,
    platformCount: PLATFORM_KEYS.length - missingMajors.length,
    missingMajors,
  };
}
