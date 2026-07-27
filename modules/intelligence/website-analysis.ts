import "server-only";

import { captureException } from "@/lib/observability";

import {
  analyzePage,
  assembleAnalysis,
  getWebsiteAnalysis,
  persistAnalysis,
} from "./analysis";

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
) {
  const existing = await getWebsiteAnalysis(businessId);
  if (existing && existing.expiresAt.getTime() > Date.now()) return existing;

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
