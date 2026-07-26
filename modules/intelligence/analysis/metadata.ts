import "server-only";

import type { ParsedHtml } from "./parse";

/**
 * [3 Metadata] (architecture.md §9.2: "title, desc, lang, viewport,
 * canonical, favicon, charset"). This phase covers title, description,
 * canonical, favicon, and language — exactly what Phase 3.3's
 * instructions name; viewport/charset extraction is deferred (see
 * docs/sprint-3.md's deviation note).
 *
 * Pure evaluation over an already-parsed page — no fetching here. The
 * caller supplies `finalUrl` (from Phase 3.2's `FetchedResource`) so
 * relative `<link>`/`<meta>` URLs (canonical, favicon) can be resolved
 * to absolute ones without this module needing to know how the page
 * was fetched.
 */

export type PageMetadata = {
  title: string | null;
  titleLength: number | null;
  metaDescription: string | null;
  metaDescriptionLength: number | null;
  /** Absolute URL, resolved against `finalUrl` — `null` if no `<link rel="canonical">` is present. */
  canonicalUrl: string | null;
  /** Absolute URL, resolved against `finalUrl` — `null` if no favicon `<link>` is declared. */
  favicon: string | null;
  /** From `<html lang="...">` — `null` if absent. */
  language: string | null;
};

function normalizeText(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed === "" ? null : trimmed;
}

function resolveUrl(
  value: string | undefined,
  finalUrl: string,
): string | null {
  if (!value) return null;
  try {
    return new URL(value, finalUrl).toString();
  } catch {
    return null;
  }
}

const FAVICON_SELECTORS = [
  'link[rel="icon"]',
  'link[rel="shortcut icon"]',
  'link[rel="apple-touch-icon"]',
];

function extractFavicon($: ParsedHtml, finalUrl: string): string | null {
  for (const selector of FAVICON_SELECTORS) {
    const href = $(selector).first().attr("href");
    const resolved = resolveUrl(href, finalUrl);
    if (resolved) return resolved;
  }
  return null;
}

export function extractMetadata($: ParsedHtml, finalUrl: string): PageMetadata {
  const title = normalizeText($("title").first().text());
  const metaDescription = normalizeText(
    $('meta[name="description"]').first().attr("content"),
  );
  const canonicalUrl = resolveUrl(
    $('link[rel="canonical"]').first().attr("href"),
    finalUrl,
  );
  const favicon = extractFavicon($, finalUrl);
  const language = normalizeText($("html").first().attr("lang"));

  return {
    title,
    titleLength: title?.length ?? null,
    metaDescription,
    metaDescriptionLength: metaDescription?.length ?? null,
    canonicalUrl,
    favicon,
    language,
  };
}
