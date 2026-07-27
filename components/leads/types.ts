import type { FavoriteStatus } from "@/modules/crm";

/**
 * Client-side shape of a row as returned by `GET /api/favorites`
 * (`modules/crm/favorites-repository.ts`'s `LeadListItem`, serialized
 * to JSON). `favoriteId` (not `businessId`) is the row identity —
 * matches `favorites`' own primary key, which is what
 * `PATCH/DELETE /api/favorites/{id}` (Phase 4.2) address.
 */
export type LeadRow = {
  favoriteId: string;
  businessId: string;
  businessName: string;
  status: FavoriteStatus;
  priority: number | null;
  followUpAt: string | null;
  leadScore: number | null;
};
