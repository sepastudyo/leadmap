import "server-only";

import { getBusinessById } from "@/modules/discovery";

import { BusinessNotFoundError } from "./errors";
import {
  countActiveFavoritesByUser,
  createFavorite,
  getFavoriteById,
  getFavoriteByUserAndBusiness,
  listDueFollowUpsByUser,
  listFavoritesByUser,
  listLeadsByIds,
  listLeadsByUser,
  softDeleteFavorite,
  updateFavorite,
  type DueFollowUp,
  type Favorite,
  type FavoritePatch,
  type LeadListItem,
} from "./favorites-repository";

/**
 * Favorites orchestration (architecture.md §3 Lead Organization:
 * "favorite a business"). Phase 4.1 built this as the *capability*
 * only, ahead of any caller — Phase 4.2 (`/api/favorites`) is the
 * first caller, the same "orchestration before HTTP surface" split
 * Sprint 2/3 used throughout.
 */

export class FavoriteNotFoundError extends Error {
  constructor() {
    super("Favorite not found.");
    this.name = "FavoriteNotFoundError";
  }
}

export class FavoriteAlreadyExistsError extends Error {
  constructor() {
    super("This business is already saved.");
    this.name = "FavoriteAlreadyExistsError";
  }
}

/**
 * Saves a business as a lead. Distinct from `toggleFavorite` below:
 * this is the create-only half `POST /api/favorites` needs (REST
 * "create"; a repeat call 409s rather than silently unsaving), while
 * `toggleFavorite` is a single save/unsave flip a future toggle-button
 * UI can call without first checking current state. Both are kept —
 * Phase 4.3's `FavoritePanel` UI ended up using `favoriteBusiness` +
 * `unfavorite` (separate save/unsave actions) rather than a toggle
 * button, so `toggleFavorite` still has no caller; left available for
 * a future UI that wants single-flip semantics instead.
 */
export async function favoriteBusiness(
  userId: string,
  businessId: string,
): Promise<Favorite> {
  const business = await getBusinessById(businessId);
  if (!business) throw new BusinessNotFoundError();

  const existing = await getFavoriteByUserAndBusiness(userId, businessId);
  if (existing) throw new FavoriteAlreadyExistsError();

  return createFavorite(userId, businessId);
}

/**
 * Save a business as a lead, or unsave it if already saved. See
 * `db/schema/favorites.ts` for why a re-save after an unsave creates a
 * fresh row rather than reviving the soft-deleted one.
 */
export async function toggleFavorite(
  userId: string,
  businessId: string,
): Promise<{ favorited: boolean; favorite: Favorite | null }> {
  const existing = await getFavoriteByUserAndBusiness(userId, businessId);

  if (existing) {
    await softDeleteFavorite(userId, existing.id);
    return { favorited: false, favorite: null };
  }

  const favorite = await createFavorite(userId, businessId);
  return { favorited: true, favorite };
}

export async function updateFavoriteDetails(
  userId: string,
  favoriteId: string,
  patch: FavoritePatch,
): Promise<Favorite> {
  const favorite = await updateFavorite(userId, favoriteId, patch);
  if (!favorite) throw new FavoriteNotFoundError();
  return favorite;
}

export async function unfavorite(
  userId: string,
  favoriteId: string,
): Promise<void> {
  const existing = await getFavoriteById(userId, favoriteId);
  if (!existing) throw new FavoriteNotFoundError();
  await softDeleteFavorite(userId, favoriteId);
}

export async function getFavoritesForUser(
  userId: string,
  options?: { limit?: number; offset?: number },
): Promise<Favorite[]> {
  return listFavoritesByUser(userId, options);
}

/**
 * The Leads page's read (Phase 4.4): favorites joined with business
 * name + Lead Score, plus the total count `DataTablePagination` needs
 * to compute "Showing X–Y of Z" / whether a next page exists.
 */
export async function getLeadsForUser(
  userId: string,
  options?: { limit?: number; offset?: number },
): Promise<{ items: LeadListItem[]; totalCount: number }> {
  const [items, totalCount] = await Promise.all([
    listLeadsByUser(userId, options),
    countActiveFavoritesByUser(userId),
  ]);

  return { items, totalCount };
}

/**
 * `/api/export`'s read (Phase 4.6): the same joined shape as
 * `getLeadsForUser`, for exactly the `favoriteId`s the client selected
 * on the Leads page rather than a page window.
 */
export async function getLeadsByIds(
  userId: string,
  favoriteIds: string[],
): Promise<LeadListItem[]> {
  return listLeadsByIds(userId, favoriteIds);
}

/**
 * Dashboard "follow-ups due today" (architecture.md §3, §20 "Reconciled
 * inconsistency 2": a pull-based query at render time — no scheduler,
 * no notification engine). "Today" is server UTC — there's no per-user
 * timezone anywhere in this app's schema (`user_settings.preferences`
 * doesn't carry one either), so this is the same "no timezone handling"
 * default the rest of the app already has, not a new gap introduced
 * here.
 */
export async function getDueFollowUpsForUser(
  userId: string,
  options?: { limit?: number },
): Promise<DueFollowUp[]> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await listDueFollowUpsByUser(userId, today, options);

  // The repository's `WHERE isNotNull(followUpAt)` guarantees this at
  // runtime; Drizzle's projected type can't express that, so it's
  // asserted here rather than left as `string | null` for every caller.
  return rows.map((row) => ({ ...row, followUpAt: row.followUpAt! }));
}
