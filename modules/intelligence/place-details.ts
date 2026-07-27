import "server-only";

import { PLACE_DETAILS_TTL_DAYS } from "@/config/constants";
import {
  getBusinessById,
  updatePlaceDetailsForBusiness,
} from "@/modules/discovery";
import { getPlaceDetails } from "@/modules/google";
import { getDecryptedKeys } from "@/modules/settings";

/**
 * Place Details enrichment (architecture.md §3 Business Intelligence:
 * "On opening a business: enrich via Place Details (cached)"; §6.2
 * lazy read-through; §6.1 ~30-day TTL). This is the *capability* only
 * — nothing calls it yet. A business detail page or Route Handler
 * (later Sprint 3 phase) is what will actually trigger "opening a
 * business"; this phase makes that trigger have something correct to
 * call.
 *
 * Deliberately never runs during a discovery search, even though
 * `getBusinessById`/`updatePlaceDetailsForBusiness` operate on the same
 * `businesses` table `modules/discovery` already populates ("cache
 * integration with the existing discovery flow" — same table, same
 * repository conventions, same DbClient pattern). Auto-enriching every
 * search result would call Place Details for up to
 * `SEARCH_PAGE_SIZE_MAX` businesses per search, which contradicts §7.3
 * ("the user's Google quota is spent only on genuinely new searches")
 * and §3's own framing of enrichment as a per-business, on-demand
 * action, not a bulk one.
 */

export class BusinessNotFoundError extends Error {
  constructor() {
    super("Business not found.");
    this.name = "BusinessNotFoundError";
  }
}

export class GoogleApiKeyMissingError extends Error {
  constructor() {
    super("Save a Google API key in Settings before enriching a business.");
    this.name = "GoogleApiKeyMissingError";
  }
}

function isFresh(detailsExpiresAt: Date | null): boolean {
  return detailsExpiresAt !== null && detailsExpiresAt.getTime() > Date.now();
}

export type RefreshOptions = {
  /** Sprint 7 Phase 7.6 (architecture.md §6.4 "Manual: a user can
   * force-refresh a business ... an explicit, user-triggered
   * invalidation"). Bypasses the freshness check below unconditionally
   * — the only caller that sets this is the new manual-refresh route;
   * every other caller omits it and gets the normal §6.2 behavior
   * unchanged. */
  force?: boolean;
};

/**
 * §6.2 read-through: fresh row → serve from Postgres, no Google call;
 * stale/missing → call Google within this request, persist, return the
 * updated row.
 */
export async function getOrRefreshPlaceDetails(
  userId: string,
  businessId: string,
  options?: RefreshOptions,
) {
  const business = await getBusinessById(businessId);
  if (!business) throw new BusinessNotFoundError();

  if (!options?.force && isFresh(business.detailsExpiresAt)) return business;

  const settings = await getDecryptedKeys(userId);
  if (!settings) throw new GoogleApiKeyMissingError();

  const details = await getPlaceDetails(
    business.googlePlaceId,
    settings.googleApiKey,
  );

  const now = new Date();
  const detailsExpiresAt = new Date(
    now.getTime() + PLACE_DETAILS_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  const updated = await updatePlaceDetailsForBusiness(businessId, {
    phone: details.phone,
    websiteUrl: details.websiteUrl,
    category: details.primaryType,
    placeSummary: { hours: details.weekdayHours },
    detailsFetchedAt: now,
    detailsExpiresAt,
  });

  // Only missing if the row was deleted between the read above and this
  // write — practically impossible (businesses aren't deleted anywhere
  // in this app), but the repository's return type is nullable, so this
  // stays honest rather than asserting it away.
  if (!updated) throw new BusinessNotFoundError();

  return updated;
}
