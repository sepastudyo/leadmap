import "server-only";

import { captureException } from "@/lib/observability";
import { getBusinessById } from "@/modules/discovery";

import {
  analyzePage,
  assembleAnalysis,
  getWebsiteAnalysis,
  persistAnalysis,
} from "./analysis";
import { BusinessNotFoundError } from "./place-details";

export type AnalysisRefreshOptions = {
  /** Sprint 7 Phase 7.6 (architecture.md §6.4 "Manual: ... re-run
   * analysis ... an explicit, user-triggered invalidation"). Bypasses
   * the freshness check below unconditionally — only the new manual-
   * refresh route sets this; every other caller is unchanged. */
  force?: boolean;
};

/**
 * Website Analysis read-through (architecture.md §6.2 lazy TTL refresh,
 * the same shape `place-details.ts`'s `getOrRefreshPlaceDetails`
 * already established): a fresh persisted row serves from Postgres with
 * no network call; a stale/missing one runs the full [1 Acquire]→
 * [13 Persist] pipeline within this request and returns the freshly
 * persisted row. This is the *capability* — a business detail page
 * (later in this same release) is what actually triggers "opening a
 * business" and calling this.
 */
export async function getOrRunWebsiteAnalysis(
  businessId: string,
  websiteUrl: string | null,
  options?: AnalysisRefreshOptions,
) {
  const existing = await getWebsiteAnalysis(businessId);
  if (
    !options?.force &&
    existing &&
    existing.expiresAt.getTime() > Date.now()
  ) {
    return existing;
  }

  // No website on file — nothing to analyze. Serve whatever was
  // previously persisted (a business can lose its website URL between
  // Place Details refreshes) rather than treating this as an error.
  if (!websiteUrl) return existing;

  try {
    const analysis = await analyzePage(websiteUrl);
    const assembled = assembleAnalysis(analysis);
    return await persistAnalysis(businessId, assembled);
  } catch (error) {
    // Unreachable site, SSRF-blocked, timed out, ... — architecture.md
    // §9.3's "a failing stage yields status = partial" is about
    // individual *stages* within a successful acquisition; a total
    // acquisition failure has nothing to assemble at all. Degrade to
    // whatever was already persisted (even if stale) rather than
    // breaking the whole page for a real, common condition (sites go
    // down, change domains, or start blocking bots) — but still report
    // it, since this same catch would otherwise indistinguishably
    // absorb a genuine bug (e.g. a regression in the SSRF guard).
    captureException(error);
    return existing;
  }
}

/**
 * Sprint 7 Phase 7.6 — the manual-refresh route's entry point.
 * `getOrRunWebsiteAnalysis` above takes `(businessId, websiteUrl)`
 * rather than looking the business up itself, matching every one of
 * its three existing callers (the Business Detail Page RSC,
 * `modules/ai/audit.ts`, `modules/ai/opportunity.ts`), all of which
 * already have the business in hand before calling it — so this thin
 * wrapper does the one thing none of those needed: resolve `businessId`
 * to a business (throwing `BusinessNotFoundError` if it doesn't exist,
 * the same class `getOrRefreshPlaceDetails` already uses) before
 * force-running analysis against its current `websiteUrl`.
 */
export async function refreshWebsiteAnalysis(businessId: string) {
  const business = await getBusinessById(businessId);
  if (!business) throw new BusinessNotFoundError();

  return getOrRunWebsiteAnalysis(businessId, business.websiteUrl, {
    force: true,
  });
}
