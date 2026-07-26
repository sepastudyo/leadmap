import "server-only";

import type { ParsedHtml } from "./parse";

/**
 * JSON-LD / Schema.org extraction (architecture.md §9.2 "Schema /
 * OpenGraph: JSON-LD/microdata types present"). JSON-LD only — Schema.org
 * can also be expressed via Microdata or RDFa, but Phase 3.3's
 * instructions name "JSON-LD / Schema.org extraction" as one item and
 * JSON-LD is the dominant modern format; Microdata/RDFa extraction is
 * not covered (see docs/sprint-3.md's deviation note).
 */

export type StructuredDataResult = {
  /** Distinct `@type` values found across every JSON-LD block, including nested ones (e.g. `author`, `@graph` entries). */
  types: string[];
  /** How many `<script type="application/ld+json">` blocks were found. */
  blockCount: number;
  /** Blocks present but not valid JSON — common in the wild, tracked rather than silently dropped. */
  invalidBlockCount: number;
};

function collectTypes(value: unknown, types: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectTypes(item, types);
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
    if (nested && typeof nested === "object") collectTypes(nested, types);
  }
}

export function extractStructuredData($: ParsedHtml): StructuredDataResult {
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
    collectTypes(parsed, types);
  });

  return {
    types: Array.from(types),
    blockCount: blocks.length,
    invalidBlockCount,
  };
}
