/**
 * Client-side shape of a business row as returned by
 * `POST /api/discovery/search` (`db/schema/businesses.ts`, serialized
 * to JSON). Covers the fields Table View displays plus `location`,
 * which Map View (Phase 2.4) needs for marker placement — everything
 * here is the *same* response Table View already renders; Map View
 * reads the same array, never a second fetch (`phone` / `website_url` /
 * `place_summary` stay null until Sprint 3's Place Details enrichment,
 * so there's nothing to show for them yet either way).
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
};
