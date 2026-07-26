"use client";

import * as React from "react";
import Link from "next/link";
import type { RowSelectionState } from "@tanstack/react-table";

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
 * `fetch`) — no server action, no new API surface. Google Maps / result
 * filtering / sorting / a business detail page are later Sprint 2
 * phases (see docs/sprint-2.md).
 */

const PAGE_SIZE = 20;

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
          {selectedCount > 0 && (
            <p className="text-muted-foreground text-sm">
              {selectedCount} selected
            </p>
          )}

          <DataTable
            columns={discoveryColumns}
            data={businesses}
            getRowId={(business) => business.id}
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
            isLoading={isLoading}
            error={
              status === "error" && errorCode !== "GOOGLE_API_KEY_MISSING"
                ? errorMessage
                : null
            }
            emptyMessage="No businesses found for this search."
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
