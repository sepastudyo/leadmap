import { z } from "zod";

/**
 * `POST /api/businesses/{id}/ai/audit` (architecture.md §13.3 "Zod at
 * every boundary"). No request body — the only client-supplied input
 * is the path param itself, validated here rather than passed straight
 * to a `uuid` column (an existing gap on this app's other by-id routes,
 * e.g. `/api/favorites/{id}`, `/api/notes/{id}`: a malformed id there
 * hits a raw Postgres cast error instead of a clean 422 — not
 * retrofitted here, out of this phase's scope, but not repeated here
 * either).
 */
export const aiAuditParamsSchema = z.object({
  id: z.uuid(),
});
export type AiAuditParams = z.infer<typeof aiAuditParamsSchema>;
