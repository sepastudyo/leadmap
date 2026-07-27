import { NextResponse } from "next/server";

import { RECENT_SEARCHES_LIMIT } from "@/config/constants";
import { jsonData, requireSession } from "@/lib/http";
import { listRecentSearches } from "@/modules/discovery";

/**
 * `GET /api/discovery/recent-searches` (Sprint 7 Phase 7.3; not in
 * architecture.md's original §12.5 table — added the same way
 * `/api/discovery/maps-key` was, a narrow endpoint for one specific
 * client need). No request body or query params — the only client-
 * supplied input is the signed-in session itself, and ownership is
 * enforced the same way every other user-plane read in this codebase
 * is: `listRecentSearches` (Phase 7.1) is scoped to `userId` from
 * `requireSession()`, never a client-supplied id.
 *
 * Returns exactly what the Dashboard's "Recent searches" card needs
 * (params to display/re-run, `resultCount`, `searchedAt`, and
 * `searchCacheId` as a stable list key) — nothing more. No business
 * logic lives here; this is a direct pass-through to the Phase 7.1
 * repository, the same shape `/api/discovery/maps-key` already uses for
 * `getDecryptedKeys`.
 */
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { userId, requestId } = session;

  const recentSearches = await listRecentSearches(
    userId,
    RECENT_SEARCHES_LIMIT,
  );

  return jsonData(recentSearches, requestId);
}
