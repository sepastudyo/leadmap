import "server-only";

import { guardedFetch, type FetchedResource } from "./guarded-fetch";

/**
 * robots.txt retrieval + evaluation (architecture.md §9.1 stage [9],
 * §9.3 "Public data only, robots.txt respected"). Retrieval and
 * `Sitemap:` directive extraction shipped in Phase 3.2; `evaluateRobotsTxt`
 * below adds the full directive evaluation (User-agent/Disallow/Allow
 * groups, §9.2's "directives") Phase 3.4 closes — a pure function over
 * the same already-fetched body, no new fetch.
 */

export type RobotsTxtResult = {
  fetched: FetchedResource;
  /** Absolute sitemap URLs declared via `Sitemap:` directives, if any. */
  sitemapUrls: string[];
};

const SITEMAP_DIRECTIVE = /^sitemap:\s*(\S+)/i;

function extractSitemapUrls(robotsBody: string, baseUrl: string): string[] {
  const urls: string[] = [];

  for (const line of robotsBody.split(/\r?\n/)) {
    const match = SITEMAP_DIRECTIVE.exec(line.trim());
    if (!match) continue;

    try {
      urls.push(new URL(match[1]!, baseUrl).toString());
    } catch {
      // Malformed directive value — skip it, don't fail the whole fetch.
    }
  }

  return urls;
}

/**
 * Returns `null` if robots.txt is genuinely unreachable (timeout, DNS
 * failure, SSRF-blocked redirect target, ...) — that's a normal,
 * common outcome (many sites have no robots.txt at all), not a failure
 * of the analysis as a whole (architecture.md §9.3 "a failing stage
 * yields status = partial rather than failing the whole analysis").
 * A 404 is *not* treated as unreachable — it's a valid, meaningful
 * response — so a fetched-but-404 `RobotsTxtResult` with an empty
 * `sitemapUrls` is returned instead of `null`.
 */
export async function fetchRobotsTxt(
  siteUrl: string,
): Promise<RobotsTxtResult | null> {
  const robotsUrl = new URL("/robots.txt", siteUrl).toString();

  try {
    const fetched = await guardedFetch(robotsUrl);
    const sitemapUrls = fetched.ok
      ? extractSitemapUrls(fetched.body, fetched.finalUrl)
      : [];
    return { fetched, sitemapUrls };
  } catch {
    return null;
  }
}

export type RobotsDirectiveGroup = {
  /** `User-agent` values this group applies to (e.g. `["*"]`, `["Googlebot", "Bingbot"]`). */
  userAgents: string[];
  disallow: string[];
  allow: string[];
};

export type RobotsEvaluation = {
  /** Was robots.txt reachable and did it return a successful response? */
  present: boolean;
  groups: RobotsDirectiveGroup[];
  sitemapUrls: string[];
  /** Does a group covering `*` (i.e. generic bots) `Disallow: /` — block crawling entirely? */
  disallowsAll: boolean;
};

const DIRECTIVE_LINE = /^([a-z-]+)\s*:\s*(.*)$/i;

/**
 * A minimal, practical robots.txt directive parser — groups consecutive
 * `User-agent:` lines together, then attributes every `Allow`/`Disallow`
 * line to the most recently opened group, per the standard's group
 * structure. Not a fully spec-compliant robots.txt implementation
 * (pattern-matching wildcards in paths, `$` end-anchors, etc. aren't
 * evaluated) — this is directive *evaluation* for the analyzer's own
 * signals (§9.2 "directives"), not a robots-compliance engine.
 */
function parseDirectiveGroups(body: string): RobotsDirectiveGroup[] {
  const groups: RobotsDirectiveGroup[] = [];
  let current: RobotsDirectiveGroup | null = null;
  let acceptingUserAgents = true;

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.split("#")[0]?.trim() ?? "";
    if (!line) continue;

    const match = DIRECTIVE_LINE.exec(line);
    if (!match) continue;

    const key = match[1]!.toLowerCase();
    const value = match[2]!.trim();

    if (key === "user-agent") {
      if (!current || !acceptingUserAgents) {
        current = { userAgents: [], disallow: [], allow: [] };
        groups.push(current);
        acceptingUserAgents = true;
      }
      current.userAgents.push(value);
    } else if (key === "disallow" && current) {
      current.disallow.push(value);
      acceptingUserAgents = false;
    } else if (key === "allow" && current) {
      current.allow.push(value);
      acceptingUserAgents = false;
    }
  }

  return groups;
}

/**
 * Pure evaluation over Phase 3.2's already-fetched `RobotsTxtResult` —
 * no new fetch. `null` (unreachable) and a fetched-but-non-2xx response
 * both evaluate to `present: false` with no groups, matching how most
 * sites (no robots.txt at all) should read.
 */
export function evaluateRobotsTxt(
  robots: RobotsTxtResult | null,
): RobotsEvaluation {
  if (!robots || !robots.fetched.ok) {
    return { present: false, groups: [], sitemapUrls: [], disallowsAll: false };
  }

  const groups = parseDirectiveGroups(robots.fetched.body);
  const disallowsAll = groups.some(
    (group) => group.userAgents.includes("*") && group.disallow.includes("/"),
  );

  return {
    present: true,
    groups,
    sitemapUrls: robots.sitemapUrls,
    disallowsAll,
  };
}
