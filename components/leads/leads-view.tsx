"use client";

import * as React from "react";
import type { RowSelectionState, SortingState } from "@tanstack/react-table";

import { DataTable } from "@/components/data-table/data-table";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";

import { leadsColumns } from "./columns";
import { FAVORITE_STATUS_LABELS } from "./status-labels";
import type { LeadRow } from "./types";

type Status = "idle" | "loading" | "error";

type LeadsResponseBody = {
  data: LeadRow[];
  meta: { limit: number; offset: number; total_count: number };
};

type ErrorResponseBody = { error?: { code?: string; message?: string } };

const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All statuses" },
  ...Object.entries(FAVORITE_STATUS_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];

export type LeadsViewProps = {
  initialLeads: LeadRow[];
  initialTotalCount: number;
  pageSize: number;
};

/**
 * `/leads` (architecture.md §3 Lead Organization, §17 Sprint 4).
 * `leads/page.tsx` (RSC) loads the first page directly through
 * `modules/crm`'s orchestration layer — the same "RSC reads directly,
 * client only for interactivity" split Phase 4.3's `FavoritePanel`/
 * `NotesPanel` established on the Business Detail Page. Every
 * subsequent page here is a `fetch` against the existing
 * `GET /api/favorites` (Phase 4.2, enriched in Phase 4.4 — see
 * `app/api/favorites/route.ts`'s doc comment); no new API surface.
 *
 * Reuses `DataTable`/`DataTablePagination` exactly as Sprint 2 Phase
 * 2.3 generalized them for this moment (offset mode, optional row
 * selection — see that phase's "Addendum" in docs/sprint-2.md). Status
 * filtering and sorting are both client-side over the current page's
 * already-fetched rows, the same "filters apply to the returned/cached
 * set" pattern `DiscoveryView` established (architecture.md §8) — no
 * new query params on the API.
 *
 * Export (Phase 4.6) reuses this same row-selection state: "Export
 * CSV"/"Export XLSX" are plain links to `GET /api/export` built from
 * the selected `favoriteId`s, so the browser's own download handling
 * does the work — no fetch/blob plumbing needed here.
 */
export function LeadsView({
  initialLeads,
  initialTotalCount,
  pageSize,
}: LeadsViewProps) {
  const [leads, setLeads] = React.useState(initialLeads);
  const [offset, setOffset] = React.useState(0);
  const [totalCount, setTotalCount] = React.useState(initialTotalCount);
  const [status, setStatus] = React.useState<Status>("idle");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [statusFilter, setStatusFilter] = React.useState("");

  const runFetch = React.useCallback(
    async (targetOffset: number) => {
      setStatus("loading");
      setErrorMessage(null);

      try {
        const response = await fetch(
          `/api/favorites?limit=${pageSize}&offset=${targetOffset}`,
        );
        const json: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          const body = json as ErrorResponseBody | null;
          setStatus("error");
          setErrorMessage(body?.error?.message ?? "Couldn't load leads.");
          return;
        }

        const body = json as LeadsResponseBody;
        setLeads(body.data);
        setTotalCount(body.meta.total_count);
        setOffset(targetOffset);
        setRowSelection({});
        setStatus("idle");
      } catch {
        setStatus("error");
        setErrorMessage("Network error — check your connection and try again.");
      }
    },
    [pageSize],
  );

  const filteredLeads = React.useMemo(() => {
    if (!statusFilter) return leads;
    return leads.filter((lead) => lead.status === statusFilter);
  }, [leads, statusFilter]);

  const selectedIds = React.useMemo(
    () =>
      Object.entries(rowSelection)
        .filter(([, isSelected]) => isSelected)
        .map(([favoriteId]) => favoriteId),
    [rowSelection],
  );
  const selectedCount = selectedIds.length;
  const hasNextPage = offset + leads.length < totalCount;

  function exportHref(format: "csv" | "xlsx") {
    return `/api/export?ids=${selectedIds.join(",")}&format=${format}`;
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Leads</h1>
        <p className="text-muted-foreground text-sm">
          Businesses you&apos;ve saved from Discovery.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          Status
          <select
            className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-8 rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            {STATUS_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {selectedCount > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground text-sm">
              {selectedCount} selected
            </span>
            <a
              href={exportHref("csv")}
              download
              className="text-primary text-sm underline-offset-4 hover:underline"
            >
              Export CSV
            </a>
            <a
              href={exportHref("xlsx")}
              download
              className="text-primary text-sm underline-offset-4 hover:underline"
            >
              Export XLSX
            </a>
          </div>
        )}
      </div>

      <DataTable
        columns={leadsColumns}
        data={filteredLeads}
        getRowId={(lead) => lead.favoriteId}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        sorting={sorting}
        onSortingChange={setSorting}
        isLoading={status === "loading"}
        error={status === "error" ? errorMessage : null}
        emptyMessage={
          statusFilter
            ? "No leads match this status filter."
            : "No saved leads yet — favorite a business from its detail page."
        }
      />

      <DataTablePagination
        pageStart={offset}
        pageSize={pageSize}
        totalCount={totalCount}
        hasNextPage={hasNextPage}
        onPreviousPage={() => void runFetch(Math.max(0, offset - pageSize))}
        onNextPage={() => void runFetch(offset + pageSize)}
        disabled={status === "loading"}
      />
    </div>
  );
}
