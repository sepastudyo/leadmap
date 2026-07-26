import "server-only";

import type { ParsedHtml } from "./parse";

/**
 * Open Graph + Twitter Card extraction (architecture.md §9.2 "Schema /
 * OpenGraph: ... og:* coverage", extended to Twitter Card tags as
 * Phase 3.3's instructions name explicitly — a separate meta-tag
 * namespace from OpenGraph, but the same "social preview metadata"
 * concern §9.2 groups OG under).
 */

function metaContent($: ParsedHtml, selector: string): string | null {
  const value = $(selector).first().attr("content");
  return value && value.trim() !== "" ? value.trim() : null;
}

export type OpenGraphData = {
  title: string | null;
  description: string | null;
  image: string | null;
  url: string | null;
  type: string | null;
  siteName: string | null;
  /** Count of every `<meta property="og:*">` tag found — a coverage signal, not just the five named fields. */
  tagCount: number;
};

export function extractOpenGraph($: ParsedHtml): OpenGraphData {
  return {
    title: metaContent($, 'meta[property="og:title"]'),
    description: metaContent($, 'meta[property="og:description"]'),
    image: metaContent($, 'meta[property="og:image"]'),
    url: metaContent($, 'meta[property="og:url"]'),
    type: metaContent($, 'meta[property="og:type"]'),
    siteName: metaContent($, 'meta[property="og:site_name"]'),
    tagCount: $('meta[property^="og:"]').length,
  };
}

export type TwitterCardData = {
  card: string | null;
  title: string | null;
  description: string | null;
  image: string | null;
  site: string | null;
  tagCount: number;
};

export function extractTwitterCard($: ParsedHtml): TwitterCardData {
  return {
    card: metaContent($, 'meta[name="twitter:card"]'),
    title: metaContent($, 'meta[name="twitter:title"]'),
    description: metaContent($, 'meta[name="twitter:description"]'),
    image: metaContent($, 'meta[name="twitter:image"]'),
    site: metaContent($, 'meta[name="twitter:site"]'),
    tagCount: $('meta[name^="twitter:"]').length,
  };
}
