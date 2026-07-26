/**
 * Search input normalization (architecture.md §6.3, §8: "Inputs are
 * validated (Zod) and normalized before signature computation" — trim,
 * lowercase, canonicalize). Framework-free — Zod validation of the raw
 * form/request input happens at the boundary (a future Route Handler),
 * this module only defines the canonical shape identical inputs
 * collapse into.
 */

export type SearchInput = {
  country: string;
  city: string;
  district?: string | null;
  category: string;
  keyword?: string | null;
};

export type NormalizedSearchInput = {
  country: string;
  city: string;
  district: string | null;
  category: string;
  keyword: string | null;
};

function normalizeField(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeOptionalField(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const normalized = normalizeField(value);
  return normalized === "" ? null : normalized;
}

export function normalizeSearchInput(
  input: SearchInput,
): NormalizedSearchInput {
  return {
    country: normalizeField(input.country),
    city: normalizeField(input.city),
    district: normalizeOptionalField(input.district),
    category: normalizeField(input.category),
    keyword: normalizeOptionalField(input.keyword),
  };
}
