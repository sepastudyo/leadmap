import { z } from "zod";

/**
 * `Idempotency-Key` header validation (architecture.md §12.4). Kept
 * generic/shared, not folded into `discovery.ts` — §12.4 applies this
 * to every paid action (search today; analyze/AI in later sprints), so
 * each Route Handler validates the same shape.
 */
export const idempotencyKeySchema = z.string().trim().min(1).max(200);
