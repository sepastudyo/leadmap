/**
 * Client-side shape of a business row as returned by
 * `POST /api/discovery/search` (`db/schema/businesses.ts`, serialized
 * to JSON). Covers the fields Table View displays plus `location`,
 * which Map View (Phase 2.4) needs for marker placement — everything
 * here is the *same* response Table View already renders; Map View
 * reads the same array, never a second fetch.
 *
 * `websiteUrl`/`leadScore` (Sprint 7 Phase 7.5, architecture.md §8
 * "has-website"/"score band" filters): both were already present in the
 * wire response's underlying `businesses` row (`websiteUrl`) or newly
 * joined in (`leadScore`, `modules/discovery/businesses-repository.ts`)
 * — either can be `null` for a business no one has individually opened
 * yet, since Place Details/analysis/scoring never run in bulk during a
 * search (§3, §7.3).
 */
export type DiscoveryBusiness = {
  id: string;
  googlePlaceId: string;
  name: string;
  category: string;
  address: string;
  country: string;
  city: string;
  district: string | null;
  location: { lat: number; lng: number };
  googleRating: number | null;
  googleReviewCount: number | null;
  websiteUrl: string | null;
  leadScore: number | null;
};
