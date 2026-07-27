import "server-only";
import { and, count, desc, eq, inArray, isNotNull, lte } from "drizzle-orm";

import {
  businesses,
  favoriteStatusEnum,
  favorites,
  leadScores,
} from "@/db/schema";
import { db, notDeleted, type DbClient } from "@/lib/db";

/**
 * `favorites` repository (architecture.md §5.2). Every query is scoped
 * to `(userId, ...)` plus `notDeleted(favorites.deletedAt)` — ownership
 * and soft-delete filtering both live here, not at each call site, the
 * same discipline `modules/discovery/businesses-repository.ts` and
 * `modules/intelligence` established for their own tables.
 */

export type Favorite = typeof favorites.$inferSelect;
export type FavoriteStatus = (typeof favoriteStatusEnum.enumValues)[number];

export type FavoritePatch = {
  status?: FavoriteStatus;
  priority?: number | null;
  /** ISO `YYYY-MM-DD`, matching the `date` column's string mode. */
  followUpAt?: string | null;
  customFields?: Record<string, unknown>;
};

export async function createFavorite(
  userId: string,
  businessId: string,
  dbClient: DbClient = db,
) {
  const [favorite] = await dbClient
    .insert(favorites)
    .values({ userId, businessId })
    .returning();

  return favorite;
}

/** The one active favorite (if any) for this user+business pair. */
export async function getFavoriteByUserAndBusiness(
  userId: string,
  businessId: string,
  dbClient: DbClient = db,
) {
  const [favorite] = await dbClient
    .select()
    .from(favorites)
    .where(
      and(
        eq(favorites.userId, userId),
        eq(favorites.businessId, businessId),
        notDeleted(favorites.deletedAt),
      ),
    )
    .limit(1);

  return favorite;
}

export async function getFavoriteById(
  userId: string,
  favoriteId: string,
  dbClient: DbClient = db,
) {
  const [favorite] = await dbClient
    .select()
    .from(favorites)
    .where(
      and(
        eq(favorites.id, favoriteId),
        eq(favorites.userId, userId),
        notDeleted(favorites.deletedAt),
      ),
    )
    .limit(1);

  return favorite;
}

/**
 * A user's active favorites, newest first. `limit`/`offset` are
 * accepted per architecture.md §12.3 ("offset for small bounded user
 * lists"). The Leads page ended up needing business name + Lead Score
 * too, so it calls the joined `listLeadsByUser` below instead — this
 * bare version (and its `getFavoritesForUser` orchestration wrapper)
 * remains unused but available for any future caller that only needs
 * the plain favorite row.
 */
export async function listFavoritesByUser(
  userId: string,
  options?: { limit?: number; offset?: number },
  dbClient: DbClient = db,
) {
  return dbClient
    .select()
    .from(favorites)
    .where(and(eq(favorites.userId, userId), notDeleted(favorites.deletedAt)))
    .orderBy(desc(favorites.createdAt))
    .limit(options?.limit ?? 50)
    .offset(options?.offset ?? 0);
}

export type LeadListItem = {
  favoriteId: string;
  businessId: string;
  businessName: string;
  status: FavoriteStatus;
  priority: number | null;
  followUpAt: string | null;
  /** `null` when no `lead_scores` row exists yet for this business
   * (architecture.md §17 Sprint 4: "Lead Score (if available)"). */
  leadScore: number | null;
};

/**
 * A user's active favorites joined with the business name and current
 * Lead Score (Sprint 4 Phase 4.4's Leads page: "Display: Business Name
 * ... Lead Score (if available)"). Neither field is on `favorites`
 * itself, so this is a dedicated read distinct from
 * `listFavoritesByUser` above — that function is left as-is for any
 * caller that only needs the bare favorite row.
 */
export async function listLeadsByUser(
  userId: string,
  options?: { limit?: number; offset?: number },
  dbClient: DbClient = db,
): Promise<LeadListItem[]> {
  return dbClient
    .select({
      favoriteId: favorites.id,
      businessId: favorites.businessId,
      businessName: businesses.name,
      status: favorites.status,
      priority: favorites.priority,
      followUpAt: favorites.followUpAt,
      leadScore: leadScores.total,
    })
    .from(favorites)
    .innerJoin(businesses, eq(favorites.businessId, businesses.id))
    .leftJoin(leadScores, eq(leadScores.businessId, favorites.businessId))
    .where(and(eq(favorites.userId, userId), notDeleted(favorites.deletedAt)))
    .orderBy(desc(favorites.createdAt))
    .limit(options?.limit ?? 50)
    .offset(options?.offset ?? 0);
}

/**
 * The same joined shape as `listLeadsByUser`, but for a specific set of
 * favorite ids rather than a page (Sprint 4 Phase 4.6's export: "Reuse
 * the existing row selection from the Leads page" — the client sends
 * exactly the `favoriteId`s currently selected). Still scoped to
 * `(userId, notDeleted)` — a manipulated id for another user's favorite
 * simply won't appear in the result, rather than erroring in a way that
 * would confirm whether that id exists at all.
 */
export async function listLeadsByIds(
  userId: string,
  favoriteIds: string[],
  dbClient: DbClient = db,
): Promise<LeadListItem[]> {
  if (favoriteIds.length === 0) return [];

  return dbClient
    .select({
      favoriteId: favorites.id,
      businessId: favorites.businessId,
      businessName: businesses.name,
      status: favorites.status,
      priority: favorites.priority,
      followUpAt: favorites.followUpAt,
      leadScore: leadScores.total,
    })
    .from(favorites)
    .innerJoin(businesses, eq(favorites.businessId, businesses.id))
    .leftJoin(leadScores, eq(leadScores.businessId, favorites.businessId))
    .where(
      and(
        eq(favorites.userId, userId),
        inArray(favorites.id, favoriteIds),
        notDeleted(favorites.deletedAt),
      ),
    )
    .orderBy(desc(favorites.createdAt));
}

/** Total active-favorite count for the user — `DataTablePagination`'s
 * `totalCount`/`hasNextPage` need this since `listLeadsByUser` only
 * returns one page. */
export async function countActiveFavoritesByUser(
  userId: string,
  dbClient: DbClient = db,
): Promise<number> {
  const [row] = await dbClient
    .select({ count: count() })
    .from(favorites)
    .where(and(eq(favorites.userId, userId), notDeleted(favorites.deletedAt)));

  return row?.count ?? 0;
}

export type DueFollowUp = {
  favoriteId: string;
  businessId: string;
  businessName: string;
  status: FavoriteStatus;
  followUpAt: string;
};

/**
 * A user's active favorites with a follow-up due on or before `today`
 * (architecture.md §3 Dashboard: "follow-ups due today (favorites
 * where `follow_up_at <= today`)", §20 "Reconciled inconsistency 2":
 * a pull-based query at load time, no scheduler/notification). Ordered
 * soonest-due first. `today` is passed in (rather than computed with
 * `now()` here) so the caller's notion of "today" — currently server
 * UTC, see `modules/crm/favorites.ts`'s `getDueFollowUpsForUser` — is
 * explicit and testable.
 */
export async function listDueFollowUpsByUser(
  userId: string,
  today: string,
  options?: { limit?: number },
  dbClient: DbClient = db,
) {
  return dbClient
    .select({
      favoriteId: favorites.id,
      businessId: favorites.businessId,
      businessName: businesses.name,
      status: favorites.status,
      followUpAt: favorites.followUpAt,
    })
    .from(favorites)
    .innerJoin(businesses, eq(favorites.businessId, businesses.id))
    .where(
      and(
        eq(favorites.userId, userId),
        notDeleted(favorites.deletedAt),
        isNotNull(favorites.followUpAt),
        lte(favorites.followUpAt, today),
      ),
    )
    .orderBy(favorites.followUpAt)
    .limit(options?.limit ?? 10);
}

export async function updateFavorite(
  userId: string,
  favoriteId: string,
  patch: FavoritePatch,
  dbClient: DbClient = db,
) {
  const [favorite] = await dbClient
    .update(favorites)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(favorites.id, favoriteId),
        eq(favorites.userId, userId),
        notDeleted(favorites.deletedAt),
      ),
    )
    .returning();

  return favorite;
}

export async function softDeleteFavorite(
  userId: string,
  favoriteId: string,
  dbClient: DbClient = db,
) {
  await dbClient
    .update(favorites)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(favorites.id, favoriteId),
        eq(favorites.userId, userId),
        notDeleted(favorites.deletedAt),
      ),
    );
}
