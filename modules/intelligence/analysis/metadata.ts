import "server-only";

import type { ParsedHtml } from "./parse";

/**
 * [3 Metadata] (architecture.md §9.2: "title, desc, lang, viewport,
 * canonical, favicon, charset") — now complete. Title, description,
 * canonical, favicon, and language shipped in Sprint 3 Phase 3.3;
 * viewport and charset close the gap identified in that phase's
 * post-review (see docs/sprint-3.md).
 *
 * Pure evaluation over an already-parsed page — no fetching here. The
 * caller supplies `finalUrl` (from Phase 3.2's `FetchedResource`) so
 * relative `<link>`/`<meta>` URLs (canonical, favicon) can be resolved
 * to absolute ones, and `headers` so charset detection can fall back to
 * the HTTP response's own `Content-Type` — both already captured by
 * `guardedFetch`, so reading them here adds no new network call.
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
  /** Raw `content` of `<meta name="viewport">` — `null` if absent. */
  viewport: string | null;
  /** From `<meta charset>`, `<meta http-equiv="Content-Type">`, or the HTTP `Content-Type` header's `charset` parameter, in that order — `null` if none declare one. */
  charset: string | null;
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

const CHARSET_PATTERN = /charset\s*=\s*["']?([^"';\s]+)/i;

function extractHttpEquivContentType($: ParsedHtml): string | null {
  let contentType: string | null = null;

  $("meta[http-equiv]").each((_, element) => {
    if (contentType) return;
    const equiv = $(element).attr("http-equiv");
    if (equiv?.toLowerCase() === "content-type") {
      contentType = $(element).attr("content") ?? null;
    }
  });

  return contentType;
}

function extractCharset(
  $: ParsedHtml,
  headers: Record<string, string>,
): string | null {
  const metaCharset = normalizeText($("meta[charset]").first().attr("charset"));
  if (metaCharset) return metaCharset;

  const httpEquivContent = extractHttpEquivContentType($);
  const httpEquivMatch = httpEquivContent
    ? CHARSET_PATTERN.exec(httpEquivContent)
    : null;
  if (httpEquivMatch) return httpEquivMatch[1]!;

  const headerContentType = headers["content-type"];
  const headerMatch = headerContentType
    ? CHARSET_PATTERN.exec(headerContentType)
    : null;
  if (headerMatch) return headerMatch[1]!;

  return null;
}

export function extractMetadata(
  $: ParsedHtml,
  finalUrl: string,
  headers: Record<string, string>,
): PageMetadata {
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
  const viewport = normalizeText(
    $('meta[name="viewport"]').first().attr("content"),
  );
  const charset = extractCharset($, headers);

  return {
    title,
    titleLength: title?.length ?? null,
    metaDescription,
    metaDescriptionLength: metaDescription?.length ?? null,
    canonicalUrl,
    favicon,
    language,
    viewport,
    charset,
  };
}
