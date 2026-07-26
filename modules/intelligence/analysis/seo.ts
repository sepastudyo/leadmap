import "server-only";

import {
  SEO_DESCRIPTION_MAX_LENGTH,
  SEO_DESCRIPTION_MIN_LENGTH,
  SEO_TITLE_MAX_LENGTH,
  SEO_TITLE_MIN_LENGTH,
} from "@/config/constants";

import type { ParsedHtml } from "./parse";
import type { PageMetadata } from "./metadata";

/**
 * [4 SEO] (architecture.md §9.2 "SEO (basic): title/description
 * quality, single-H1 check, heading hierarchy, canonical correctness,
 * noindex/nofollow, indexability verdict"), extended with the image
 * alt coverage and internal/external link statistics Phase 3.3's
 * instructions name explicitly (not in §9.2's own bullet list, but not
 * excluded by anything in it either — see docs/sprint-3.md).
 */

const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;
type HeadingTag = (typeof HEADING_TAGS)[number];

export type HeadingStructure = {
  counts: Record<HeadingTag, number>;
  h1Texts: string[];
  hasSingleH1: boolean;
  /** `false` if any heading level skips over one not yet seen (e.g. an h3 before any h2). */
  hierarchyIsSequential: boolean;
};

export type TextQuality = {
  present: boolean;
  length: number;
  withinRecommendedLength: boolean;
};

export type RobotsMetaResult = {
  noindex: boolean;
  nofollow: boolean;
  /** Raw directive values found, from `<meta name="robots">` and/or the `X-Robots-Tag` header. */
  raw: string[];
};

export type ImageAltCoverage = {
  totalImages: number;
  /** Non-empty `alt` text. */
  withAlt: number;
  /** `alt=""` — valid for intentionally decorative images, tracked separately from missing. */
  withEmptyAlt: number;
  /** No `alt` attribute at all. */
  missingAlt: number;
  /** `(withAlt + withEmptyAlt) / totalImages` — an explicit `alt=""` counts as covered (a deliberate authoring choice), `0` if the page has no images. */
  coveragePercent: number;
};

export type LinkStatistics = {
  totalLinks: number;
  internalLinks: number;
  externalLinks: number;
  /** `href`-less anchors, `#fragment`-only, or `javascript:`/`mailto:`/`tel:` — excluded from internal/external. */
  nonNavigableLinks: number;
};

export type SeoAnalysis = {
  title: TextQuality;
  description: TextQuality;
  headings: HeadingStructure;
  canonicalMatchesFinalUrl: boolean | null;
  robotsMeta: RobotsMetaResult;
  indexable: boolean;
  images: ImageAltCoverage;
  links: LinkStatistics;
};

function evaluateTextQuality(
  value: string | null,
  length: number | null,
  min: number,
  max: number,
): TextQuality {
  return {
    present: value !== null,
    length: length ?? 0,
    withinRecommendedLength: length !== null && length >= min && length <= max,
  };
}

function extractHeadings($: ParsedHtml): HeadingStructure {
  const counts: Record<HeadingTag, number> = {
    h1: 0,
    h2: 0,
    h3: 0,
    h4: 0,
    h5: 0,
    h6: 0,
  };
  const h1Texts: string[] = [];
  const levels: number[] = [];

  $(HEADING_TAGS.join(",")).each((_, element) => {
    if (element.type !== "tag") return;

    const tag = element.tagName.toLowerCase() as HeadingTag;
    if (!(tag in counts)) return;

    counts[tag] += 1;
    const level = Number(tag.slice(1));
    levels.push(level);

    if (tag === "h1") {
      const text = $(element).text().trim().replace(/\s+/g, " ");
      if (text) h1Texts.push(text);
    }
  });

  let maxSeen = 0;
  let hierarchyIsSequential = true;
  for (const level of levels) {
    if (level > maxSeen + 1) hierarchyIsSequential = false;
    maxSeen = Math.max(maxSeen, level);
  }

  return {
    counts,
    h1Texts,
    hasSingleH1: counts.h1 === 1,
    hierarchyIsSequential,
  };
}

const ROBOTS_TAG_HEADER = "x-robots-tag";

function extractRobotsMeta(
  $: ParsedHtml,
  headers: Record<string, string>,
): RobotsMetaResult {
  const raw: string[] = [];

  const metaContent = $('meta[name="robots"]').first().attr("content");
  if (metaContent) raw.push(metaContent);

  const headerValue = headers[ROBOTS_TAG_HEADER];
  if (headerValue) raw.push(headerValue);

  const combined = raw.join(",").toLowerCase();

  return {
    noindex: combined.includes("noindex"),
    nofollow: combined.includes("nofollow"),
    raw,
  };
}

const NON_NAVIGABLE_SCHEMES = /^(javascript:|mailto:|tel:|#|$)/i;

function extractLinkStatistics(
  $: ParsedHtml,
  finalUrl: string,
): LinkStatistics {
  let internalLinks = 0;
  let externalLinks = 0;
  let nonNavigableLinks = 0;

  let finalHostname: string;
  try {
    finalHostname = new URL(finalUrl).hostname;
  } catch {
    finalHostname = "";
  }

  $("a[href]").each((_, element) => {
    const href = ($(element).attr("href") ?? "").trim();

    if (NON_NAVIGABLE_SCHEMES.test(href)) {
      nonNavigableLinks += 1;
      return;
    }

    try {
      const resolved = new URL(href, finalUrl);
      if (resolved.hostname === finalHostname) {
        internalLinks += 1;
      } else {
        externalLinks += 1;
      }
    } catch {
      nonNavigableLinks += 1;
    }
  });

  return {
    totalLinks: internalLinks + externalLinks + nonNavigableLinks,
    internalLinks,
    externalLinks,
    nonNavigableLinks,
  };
}

function extractImageAltCoverage($: ParsedHtml): ImageAltCoverage {
  let withAlt = 0;
  let withEmptyAlt = 0;
  let missingAlt = 0;

  $("img").each((_, element) => {
    const alt = $(element).attr("alt");
    if (alt === undefined) {
      missingAlt += 1;
    } else if (alt.trim() === "") {
      withEmptyAlt += 1;
    } else {
      withAlt += 1;
    }
  });

  const totalImages = withAlt + withEmptyAlt + missingAlt;

  return {
    totalImages,
    withAlt,
    withEmptyAlt,
    missingAlt,
    coveragePercent:
      totalImages === 0
        ? 0
        : Math.round(((withAlt + withEmptyAlt) / totalImages) * 100),
  };
}

export function analyzeSeo(
  $: ParsedHtml,
  metadata: PageMetadata,
  context: { finalUrl: string; headers: Record<string, string> },
): SeoAnalysis {
  const robotsMeta = extractRobotsMeta($, context.headers);

  return {
    title: evaluateTextQuality(
      metadata.title,
      metadata.titleLength,
      SEO_TITLE_MIN_LENGTH,
      SEO_TITLE_MAX_LENGTH,
    ),
    description: evaluateTextQuality(
      metadata.metaDescription,
      metadata.metaDescriptionLength,
      SEO_DESCRIPTION_MIN_LENGTH,
      SEO_DESCRIPTION_MAX_LENGTH,
    ),
    headings: extractHeadings($),
    canonicalMatchesFinalUrl:
      metadata.canonicalUrl === null
        ? null
        : metadata.canonicalUrl === context.finalUrl,
    robotsMeta,
    indexable: !robotsMeta.noindex,
    images: extractImageAltCoverage($),
    links: extractLinkStatistics($, context.finalUrl),
  };
}
