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
