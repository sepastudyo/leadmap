import { z } from "zod";

/**
 * `POST /api/businesses/{id}/ai/audit` (architecture.md §13.3 "Zod at
 * every boundary"). No request body — the only client-supplied input
 * is the path param itself, validated here rather than passed straight
 * to a `uuid` column. The equivalent gap on this app's other by-id
 * routes (`/api/favorites/{id}`, `/api/notes/{id}`,
 * `/api/businesses/{id}/notes`) was closed in Sprint 6 Phase 6.2 via
 * `lib/validation/crm.ts`'s `idParamSchema` — kept as a separate schema
 * here rather than importing that one, since this file's schemas are
 * AI-domain-scoped and the two happen to share shape only coincidentally.
 */
export const aiAuditParamsSchema = z.object({
  id: z.uuid(),
});
export type AiAuditParams = z.infer<typeof aiAuditParamsSchema>;
