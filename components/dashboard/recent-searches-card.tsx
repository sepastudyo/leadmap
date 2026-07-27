"use client";

import * as React from "react";
import Link from "next/link";

type RecentSearchParams = {
  country: string;
  city: string;
  district: string | null;
  category: string;
  keyword: string | null;
};

export type RecentSearchItem = {
  searchCacheId: string;
  params: RecentSearchParams;
  resultCount: number;
  searchedAt: string;
};

type ResponseBody = { data: RecentSearchItem[] };

type Status = "loading" | "error" | "success";

/** `country`/`city`/`district`/`category`/`keyword` carried as-is —
 * `GET /api/discovery/search` accepts exactly this normalized shape
 * already (`modules/discovery/normalize.ts`), so no new query-param
 * contract is introduced here. Discovery itself doesn't read these yet
 * (out of this phase's scope; see the Phase 7.4 completion report) —
 * this only builds the correct destination URL. */
function buildDiscoveryHref(params: RecentSearchParams): string {
  const query = new URLSearchParams();
  query.set("country", params.country);
  query.set("city", params.city);
  if (params.district) query.set("district", params.district);
  query.set("category", params.category);
  if (params.keyword) query.set("keyword", params.keyword);
  return `/discovery?${query.toString()}`;
}

function formatLocation(params: RecentSearchParams): string {
  return [params.district, params.city, params.country]
    .filter((part): part is string => Boolean(part))
    .join(", ");
}

/**
 * Dashboard's "Recent searches" card (Sprint 7 Phase 7.4). A thin
 * client over `GET /api/discovery/recent-searches` (Phase 7.3) — no
 * business logic here, the same fetch-on-mount shape `MapView` already
 * uses for its own one-shot load (`components/discovery/map-view.tsx`).
 */
export function RecentSearchesCard() {
  const [status, setStatus] = React.useState<Status>("loading");
  const [searches, setSearches] = React.useState<RecentSearchItem[]>([]);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/discovery/recent-searches");
        if (!response.ok) throw new Error("Failed to load recent searches.");

        const json = (await response.json()) as ResponseBody;
        if (cancelled) return;

        setSearches(json.data);
        setStatus("success");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="text-sm font-medium">Recent searches</h2>

      {status === "loading" && (
        <p className="text-muted-foreground mt-1 text-sm">Loading…</p>
      )}

      {status === "error" && (
        <p className="text-muted-foreground mt-1 text-sm">
          Couldn&apos;t load recent searches.
        </p>
      )}

      {status === "success" && searches.length === 0 && (
        <p className="text-muted-foreground mt-1 text-sm">
          No searches yet — run a search from Discovery to see it here.
        </p>
      )}

      {status === "success" && searches.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {searches.map((item) => (
            <li key={item.searchCacheId} className="text-sm">
              <Link
                href={buildDiscoveryHref(item.params)}
                className="font-medium underline-offset-4 hover:underline"
              >
                {item.params.category}
                {item.params.keyword ? ` — ${item.params.keyword}` : ""}
              </Link>
              <span className="text-muted-foreground">
                {" "}
                · {formatLocation(item.params)} · {item.resultCount} result
                {item.resultCount === 1 ? "" : "s"} ·{" "}
                {new Date(item.searchedAt).toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
