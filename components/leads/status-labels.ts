import type { FavoriteStatus } from "@/modules/crm";

/**
 * Shared, framework-free status labels — used by the Leads table
 * (`columns.tsx`), the status filter (`leads-view.tsx`), and the export
 * route (`app/api/export/route.ts`, Phase 4.6). Deliberately not
 * `"use client"` or `"server-only"` so both a client component and a
 * Route Handler can import the same constant instead of each keeping
 * its own copy.
 */
export const FAVORITE_STATUS_LABELS: Record<FavoriteStatus, string> = {
  new: "New",
  reviewing: "Reviewing",
  qualified: "Qualified",
  not_fit: "Not a fit",
  won: "Won",
};
