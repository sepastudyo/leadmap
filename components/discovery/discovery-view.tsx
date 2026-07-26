"use client";

import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { RowSelectionState, SortingState } from "@tanstack/react-table";

import { DataTable } from "@/components/data-table/data-table";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { discoveryColumns } from "./columns";
import type { DiscoveryBusiness } from "./types";

/**
 * Staged search UI + orchestration for the Discovery page. Consumes
 * the existing `/api/discovery/search` endpoint directly (client-side
 * `fetch`) — no server action, no new API surface.
 *
 * Filtering (architecture.md §8: "Filters (rating, has-website,
 * category, score band, distance) apply to the returned/cached set —
 * client-side for the current page") only covers `category` and
 * `rating` here — `has-website` needs `businesses.website_url`
 * (Sprint 3 Place Details), `score band` needs `lead_scores` (Sprint 3
 * Lead Score engine), and `distance` needs a reference point this app
 * has no UI for yet. Those three filter on data that doesn't exist
 * until later sprints, not a Sprint 2 gap.
 *
 * A business detail page is a later Sprint 2/3 concern (see
 * docs/sprint-2.md).
 */

const PAGE_SIZE = 20;

/** Stable reference — shared by DataTable and MapView so neither re-runs
 * effects/memoization on every render just because a new inline
 * closure was passed. */
function getBusinessId(business: DiscoveryBusiness): string {
  return business.id;
}

// `ssr: false` + dynamic import is the actual lazy-load: neither this
// component's code nor the Google Maps JS bundle it pulls in downloads
// until `hasOpenedMap` (below) causes it to mount for the first time.
const MapView = dynamic(() => import("./map-view"), {
  ssr: false,
  loading: () => (
    <div className="border-border flex h-[560px] items-center justify-center rounded-lg border">
      <p className="text-muted-foreground text-sm">Loading map…</p>
    </div>
  ),
});

type FormState = {
  country: string;
  city: string;
  district: string;
  category: string;
  keyword: string;
};

const EMPTY_FORM: FormState = {
  country: "",
  city: "",
  district: "",
  category: "",
  keyword: "",
};

type SearchResponseBody = {
  data: DiscoveryBusiness[];
  meta: {
    next_cursor: number | null;
    from_cache: boolean;
    total_cached: number;
  };
};

type ErrorResponseBody = {
  error: { code: string; message: string };
};

type Status = "idle" | "loading" | "error" | "success";

export function DiscoveryView() {
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const [submittedForm, setSubmittedForm] = React.useState<FormState | null>(
    null,
  );
  const [cursor, setCursor] = React.useState(0);
  const [businesses, setBusinesses] = React.useState<DiscoveryBusiness[]>([]);
  const [nextCursor, setNextCursor] = React.useState<number | null>(null);
  const [totalCached, setTotalCached] = React.useState(0);
  const [status, setStatus] = React.useState<Status>("idle");
  const [errorCode, setErrorCode] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [categoryFilter, setCategoryFilter] = React.useState("");
  const [minRating, setMinRating] = React.useState("");
  const [view, setView] = React.useState<"table" | "map">("table");
  const [hasOpenedMap, setHasOpenedMap] = React.useState(false);

  const runSearch = React.useCallback(
    async (searchForm: FormState, targetCursor: number) => {
      setStatus("loading");
      setErrorCode(null);
      setErrorMessage(null);

      try {
        const response = await fetch("/api/discovery/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            country: searchForm.country,
            city: searchForm.city,
            district: searchForm.district || undefined,
            category: searchForm.category,
            keyword: searchForm.keyword || undefined,
            cursor: targetCursor,
            pageSize: PAGE_SIZE,
          }),
        });

        const json: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          const body = json as ErrorResponseBody | null;
          setStatus("error");
          setErrorCode(body?.error?.code ?? null);
          setErrorMessage(body?.error?.message ?? "Search failed. Try again.");
          return;
        }

        const body = json as SearchResponseBody;
        setBusinesses(body.data);
        setNextCursor(body.meta.next_cursor);
        setTotalCached(body.meta.total_cached);
        setCursor(targetCursor);
        setRowSelection({});
        setStatus("success");
      } catch {
        setStatus("error");
        setErrorMessage("Network error — check your connection and try again.");
      }
    },
    [],
  );

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittedForm(form);
    void runSearch(form, 0);
  }

  function handleNextPage() {
    if (!submittedForm || nextCursor === null) return;
    void runSearch(submittedForm, nextCursor);
  }

  function handlePreviousPage() {
    if (!submittedForm) return;
    void runSearch(submittedForm, Math.max(0, cursor - PAGE_SIZE));
  }

  function handleViewChange(next: "table" | "map") {
    setView(next);
    if (next === "map") setHasOpenedMap(true);
  }

  // architecture.md §8 — client-side filtering over the current page's
  // already-fetched results. Table and Map both render this same
  // filtered array (not two separately-filtered copies), so what's
  // visible in one is exactly what's visible in the other.
  const filteredBusinesses = React.useMemo(() => {
    const minRatingValue = minRating === "" ? null : Number(minRating);
    const categoryQuery = categoryFilter.trim().toLowerCase();

    return businesses.filter((business) => {
      if (
        categoryQuery &&
        !business.category.toLowerCase().includes(categoryQuery)
      ) {
        return false;
      }
      if (
        minRatingValue !== null &&
        (business.googleRating === null ||
          business.googleRating < minRatingValue)
      ) {
        return false;
      }
      return true;
    });
  }, [businesses, categoryFilter, minRating]);

  const isFiltered = categoryFilter.trim() !== "" || minRating !== "";
  const selectedCount = Object.values(rowSelection).filter(Boolean).length;
  const isLoading = status === "loading";

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Discovery</h1>
        <p className="text-muted-foreground text-sm">
          Search for real businesses by area and category.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
      >
        <SearchField
          label="Country"
          value={form.country}
          onChange={(value) => setForm((f) => ({ ...f, country: value }))}
          required
        />
        <SearchField
          label="City"
          value={form.city}
          onChange={(value) => setForm((f) => ({ ...f, city: value }))}
          required
        />
        <SearchField
          label="District"
          value={form.district}
          onChange={(value) => setForm((f) => ({ ...f, district: value }))}
        />
        <SearchField
          label="Category"
          value={form.category}
          onChange={(value) => setForm((f) => ({ ...f, category: value }))}
          required
        />
        <SearchField
          label="Keyword"
          value={form.keyword}
          onChange={(value) => setForm((f) => ({ ...f, keyword: value }))}
        />
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Searching…" : "Search"}
        </Button>
      </form>

      {status === "error" && errorCode === "GOOGLE_API_KEY_MISSING" && (
        <p className="text-destructive text-sm">
          {errorMessage}{" "}
          <Link href="/settings" className="underline underline-offset-4">
            Go to Settings
          </Link>
          .
        </p>
      )}

      {submittedForm ? (
        <div className="flex flex-1 flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="discovery-filter-category">
                  Filter by category
                </Label>
                <Input
                  id="discovery-filter-category"
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                  className="sm:w-40"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="discovery-filter-rating">Min. rating</Label>
                <select
                  id="discovery-filter-rating"
                  value={minRating}
                  onChange={(event) => setMinRating(event.target.value)}
                  className="border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-8 rounded-lg border bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:ring-3"
                >
                  <option value="">Any</option>
                  <option value="3">3+</option>
                  <option value="4">4+</option>
                  <option value="4.5">4.5+</option>
                </select>
              </div>
              {isFiltered && (
                <p className="text-muted-foreground pb-1.5 text-sm">
                  Showing {filteredBusinesses.length} of {businesses.length}
                </p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={view === "table" ? "default" : "outline"}
                  onClick={() => handleViewChange("table")}
                >
                  Table
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={view === "map" ? "default" : "outline"}
                  onClick={() => handleViewChange("map")}
                >
                  Map
                </Button>
              </div>
              {selectedCount > 0 && (
                <p className="text-muted-foreground text-sm">
                  {selectedCount} selected
                </p>
              )}
            </div>
          </div>

          <div
            className={
              view === "table" ? "flex flex-1 flex-col gap-3" : "hidden"
            }
          >
            <DataTable
              columns={discoveryColumns}
              data={filteredBusinesses}
              getRowId={getBusinessId}
              rowSelection={rowSelection}
              onRowSelectionChange={setRowSelection}
              sorting={sorting}
              onSortingChange={setSorting}
              isLoading={isLoading}
              error={
                status === "error" && errorCode !== "GOOGLE_API_KEY_MISSING"
                  ? errorMessage
                  : null
              }
              emptyMessage={
                isFiltered
                  ? "No businesses match these filters."
                  : "No businesses found for this search."
              }
              className="h-[560px]"
            />

            <DataTablePagination
              pageStart={cursor}
              pageSize={PAGE_SIZE}
              totalCount={totalCached}
              hasNextPage={nextCursor !== null}
              onPreviousPage={handlePreviousPage}
              onNextPage={handleNextPage}
              disabled={isLoading}
            />
          </div>

          {hasOpenedMap && (
            <div className={view === "map" ? "flex flex-1 flex-col" : "hidden"}>
              <MapView
                businesses={filteredBusinesses}
                rowSelection={rowSelection}
                onRowSelectionChange={setRowSelection}
                getRowId={getBusinessId}
                className="h-[560px]"
              />
            </div>
          )}
        </div>
      ) : (
        <div className="border-border text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm">
          Enter a country, city, and category above, then search.
        </div>
      )}
    </div>
  );
}

function SearchField({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const id = `discovery-${label.toLowerCase()}`;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        className="sm:w-40"
      />
    </div>
  );
}
