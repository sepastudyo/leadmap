import { z } from "zod";

import { EXPORT_MAX_ROWS } from "@/config/constants";
import { favoriteStatusEnum } from "@/db/schema";

/**
 * Zod schemas for the Lead Organization boundary (architecture.md
 * §13.3, §12.5 `/api/favorites`, `/api/businesses/{id}/notes`).
 */

export const createFavoriteSchema = z.object({
  businessId: z.uuid(),
});
export type CreateFavoriteInput = z.infer<typeof createFavoriteSchema>;

export const listFavoritesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListFavoritesQuery = z.infer<typeof listFavoritesQuerySchema>;

export const updateFavoriteSchema = z
  .object({
    status: z.enum(favoriteStatusEnum.enumValues).optional(),
    priority: z.number().int().nullable().optional(),
    followUpAt: z.iso.date().nullable().optional(),
    customFields: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });
export type UpdateFavoriteInput = z.infer<typeof updateFavoriteSchema>;

export const createNoteSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});
export type CreateNoteInput = z.infer<typeof createNoteSchema>;

export const updateNoteSchema = z
  .object({
    body: z.string().trim().min(1).max(4000).optional(),
    pinned: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;

/**
 * `GET /api/export` (architecture.md §12.5 "Stream CSV/XLSX of selected
 * leads", Sprint 4 Phase 4.6). `ids` is a comma-separated list of
 * `favoriteId`s — the Leads page's existing row selection (Phase 4.4),
 * not a fresh query — capped at `EXPORT_MAX_ROWS` ("Keep exports
 * bounded").
 */
export const exportQuerySchema = z.object({
  ids: z
    .string()
    .min(1)
    .transform((value) => value.split(",").map((id) => id.trim()))
    .pipe(z.array(z.uuid()).min(1).max(EXPORT_MAX_ROWS)),
  format: z.enum(["csv", "xlsx"]).default("csv"),
});
export type ExportQuery = z.infer<typeof exportQuerySchema>;
