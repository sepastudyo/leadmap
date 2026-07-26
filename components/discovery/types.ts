/**
 * Client-side shape of a business row as returned by
 * `POST /api/discovery/search` (`db/schema/businesses.ts`, serialized
 * to JSON). Only the fields the Discovery table actually displays —
 * `phone` / `website_url` / `place_summary` stay null until Sprint 3's
 * Place Details enrichment, so there's nothing to show for them yet.
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
  googleRating: number | null;
  googleReviewCount: number | null;
};
