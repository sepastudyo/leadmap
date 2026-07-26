import { z } from "zod";

import {
  SEARCH_PAGE_SIZE_DEFAULT,
  SEARCH_PAGE_SIZE_MAX,
} from "@/config/constants";

/**
 * Zod schema for `POST /api/discovery/search` (architecture.md §13.3
 * "Zod at every boundary", §8 "Inputs are validated (Zod) and
 * normalized before signature computation"). Validation happens here,
 * at the Route Handler boundary; `modules/discovery/normalize.ts`
 * handles canonicalization afterward — two different concerns
 * (rejecting bad input vs. collapsing equivalent good input).
 */
const stagedField = z.string().trim().min(1).max(100);

export const searchRequestSchema = z.object({
  country: stagedField,
  city: stagedField,
  district: stagedField.optional(),
  category: stagedField,
  keyword: z.string().trim().min(1).max(200).optional(),
  cursor: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(SEARCH_PAGE_SIZE_MAX)
    .default(SEARCH_PAGE_SIZE_DEFAULT),
});

export type SearchRequestInput = z.infer<typeof searchRequestSchema>;
