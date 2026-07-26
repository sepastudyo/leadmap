import "server-only";

import type { ParsedHtml } from "./parse";

/**
 * Schema.org extraction (architecture.md §9.2 "Schema / OpenGraph:
 * JSON-LD/microdata types present"). JSON-LD shipped in Sprint 3 Phase
 * 3.3; Microdata and RDFa close the gap identified in that phase's
 * post-review (see docs/sprint-3.md) — Schema.org types can be
 * expressed in any of the three formats, and §9.2 names microdata
 * explicitly.
 */

export type JsonLdResult = {
  /** How many `<script type="application/ld+json">` blocks were found. */
  blockCount: number;
  /** Blocks present but not valid JSON — common in the wild, tracked rather than silently dropped. */
  invalidBlockCount: number;
  /** Distinct `@type` values found across every block, including nested ones (e.g. `author`, `@graph` entries). */
  types: string[];
};

export type MicrodataResult = {
  /** How many `[itemscope]` elements were found. */
  itemCount: number;
  /** Distinct `itemtype` values, normalized to their last URI path segment. */
  types: string[];
};

export type RdfaResult = {
  /** How many `[typeof]` elements were found. */
  itemCount: number;
  /** Distinct `typeof` values, normalized to their last URI path segment. */
  types: string[];
};

export type StructuredDataResult = {
  /** Union of types found across JSON-LD, Microdata, and RDFa. */
  types: string[];
  jsonLd: JsonLdResult;
  microdata: MicrodataResult;
  rdfa: RdfaResult;
};

function collectJsonLdTypes(value: unknown, types: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectJsonLdTypes(item, types);
    return;
  }

  if (!value || typeof value !== "object") return;

  const obj = value as Record<string, unknown>;
  const type = obj["@type"];
  if (typeof type === "string") {
    types.add(type);
  } else if (Array.isArray(type)) {
    for (const entry of type) {
      if (typeof entry === "string") types.add(entry);
    }
  }

  for (const nested of Object.values(obj)) {
    if (nested && typeof nested === "object") collectJsonLdTypes(nested, types);
  }
}

function extractJsonLd($: ParsedHtml): JsonLdResult {
  const blocks = $('script[type="application/ld+json"]');
  const types = new Set<string>();
  let invalidBlockCount = 0;

  blocks.each((_, element) => {
    const raw = $(element).text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      invalidBlockCount += 1;
      return;
    }
    collectJsonLdTypes(parsed, types);
  });

  return {
    blockCount: blocks.length,
    invalidBlockCount,
    types: Array.from(types),
  };
}

/**
 * Normalizes a Schema.org type token to a comparable, human-readable
 * name. Microdata/RDFa types are commonly full URIs
 * (`https://schema.org/LocalBusiness`) but RDFa also allows bare
 * vocab-relative terms (`LocalBusiness` alongside a `vocab=
 * "https://schema.org/"` attribute) — falling back to the raw token
 * when it isn't a parseable URL handles both without needing to
 * resolve `vocab`/`prefix` context.
 */
function lastPathSegment(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) return trimmed;
  try {
    const url = new URL(trimmed);
    const segments = url.pathname.split("/").filter(Boolean);
    return segments.length > 0 ? segments[segments.length - 1]! : trimmed;
  } catch {
    return trimmed;
  }
}

function extractMicrodata($: ParsedHtml): MicrodataResult {
  const items = $("[itemscope]");
  const types = new Set<string>();

  items.each((_, element) => {
    const itemtype = $(element).attr("itemtype");
    if (!itemtype) return;
    for (const token of itemtype.split(/\s+/).filter(Boolean)) {
      types.add(lastPathSegment(token));
    }
  });

  return {
    itemCount: items.length,
    types: Array.from(types),
  };
}

function extractRdfa($: ParsedHtml): RdfaResult {
  const items = $("[typeof]");
  const types = new Set<string>();

  items.each((_, element) => {
    const typeOf = $(element).attr("typeof");
    if (!typeOf) return;
    for (const token of typeOf.split(/\s+/).filter(Boolean)) {
      types.add(lastPathSegment(token));
    }
  });

  return {
    itemCount: items.length,
    types: Array.from(types),
  };
}

export function extractStructuredData($: ParsedHtml): StructuredDataResult {
  const jsonLd = extractJsonLd($);
  const microdata = extractMicrodata($);
  const rdfa = extractRdfa($);

  const types = new Set<string>([
    ...jsonLd.types,
    ...microdata.types,
    ...rdfa.types,
  ]);

  return {
    types: Array.from(types),
    jsonLd,
    microdata,
    rdfa,
  };
}
