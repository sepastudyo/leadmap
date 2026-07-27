import { z } from "zod";

/**
 * Website Analyzer input validation (architecture.md §13.3 "Zod at
 * every boundary"). A business's `website_url` is Google- or
 * site-owner-supplied — untrusted per §13.3 — so it's validated as a
 * well-formed http(s) URL before anything downstream treats it as
 * fetchable.
 *
 * This is *input* validation, not the SSRF security control itself
 * (`modules/intelligence/analysis/ssrf-guard.ts` is that) — a
 * syntactically valid `https://` URL can still resolve to a blocked
 * address; this schema only rejects malformed input early, the same
 * division of concerns as every other boundary in this app.
 */
export const analysisTargetUrlSchema = z.url({ protocol: /^https?$/ });

/**
 * [12 Assemble] (architecture.md §9.1 "normalize → validate (Zod) →
 * content_hash → analyzer_version"). Validates the *structural
 * invariants* of an assembled `website_analyses` row before it's
 * persisted — not a deep schema for every nested jsonb stage output
 * (that's already TS-enforced at construction time from trusted,
 * internally-computed data, not external user input), but the fields
 * that must hold for the row to make sense at all: `status` is one of
 * the three known values, `httpStatus` is a plausible HTTP status code
 * (or absent), `contentHash` is a real sha256 hex digest, and
 * `expiresAt` is genuinely after `analyzedAt`.
 */
export const assembledAnalysisSchema = z
  .object({
    urlAnalyzed: z.url(),
    finalUrl: z.url(),
    status: z.enum(["ok", "partial", "failed"]),
    httpStatus: z.number().int().min(100).max(599).nullable(),
    ssl: z.record(z.string(), z.unknown()),
    metadata: z.record(z.string(), z.unknown()),
    schemaOrg: z.record(z.string(), z.unknown()),
    seo: z.record(z.string(), z.unknown()),
    cms: z.record(z.string(), z.unknown()),
    tracking: z.record(z.string(), z.unknown()),
    social: z.record(z.string(), z.unknown()),
    robots: z.record(z.string(), z.unknown()),
    sitemap: z.record(z.string(), z.unknown()),
    contentHash: z.string().regex(/^[0-9a-f]{64}$/),
    analyzerVersion: z.string().min(1),
    analyzedAt: z.date(),
    expiresAt: z.date(),
  })
  .refine((value) => value.expiresAt > value.analyzedAt, {
    message: "expiresAt must be after analyzedAt",
  });
