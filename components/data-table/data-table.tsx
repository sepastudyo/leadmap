"use client";

import * as React from "react";
import {
  type ColumnDef,
  type OnChangeFn,
  type RowSelectionState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";

import { cn } from "@/lib/utils";

/**
 * Reusable virtualized table (architecture.md §14 "Virtualization:
 * windowed rendering (TanStack Virtual) for the results table", §19
 * "TanStack Table + TanStack Virtual"). Deliberately presentation-only:
 * no sorting/filtering model is wired up (out of scope for this
 * phase — see docs/sprint-2.md) and no data-fetching — the caller owns
 * both. Renders as ARIA grid `div`s rather than a semantic `<table>`
 * because virtualized rows need `position: absolute`, which isn't
 * valid on `<tr>`.
 */

const ESTIMATED_ROW_HEIGHT = 44;
const OVERSCAN = 8;

export type DataTableProps<TData> = {
  columns: ColumnDef<TData>[];
  data: TData[];
  getRowId: (row: TData) => string;
  rowSelection: RowSelectionState;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
  isLoading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  /** className on the scrollable viewport — controls the table's height. */
  className?: string;
};

export function DataTable<TData>({
  columns,
  data,
  getRowId,
  rowSelection,
  onRowSelectionChange,
  isLoading = false,
  error = null,
  emptyMessage = "No results.",
  className,
}: DataTableProps<TData>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId,
    state: { rowSelection },
    onRowSelectionChange,
    enableRowSelection: true,
  });

  const rows = table.getRowModel().rows;
  const gridTemplateColumns = table
    .getVisibleLeafColumns()
    .map((column) => `${column.getSize()}px`)
    .join(" ");

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  if (error) {
    return (
      <div
        role="alert"
        className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-6 text-center text-sm"
      >
        {error}
      </div>
    );
  }

  if (isLoading && data.length === 0) {
    return (
      <div className="border-border divide-border divide-y rounded-lg border">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex items-center gap-4 p-3">
            <div className="bg-muted h-4 w-4 animate-pulse rounded-sm" />
            <div className="bg-muted h-4 flex-1 animate-pulse rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (!isLoading && data.length === 0) {
    return (
      <div className="border-border text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      role="table"
      aria-rowcount={rows.length}
      className={cn(
        "border-border relative overflow-auto rounded-lg border",
        className,
      )}
    >
      <div
        role="rowgroup"
        className="bg-card sticky top-0 z-10 grid min-w-full border-b"
        style={{ gridTemplateColumns }}
      >
        {table.getHeaderGroups().map((headerGroup) =>
          headerGroup.headers.map((header) => (
            <div
              key={header.id}
              role="columnheader"
              className="text-muted-foreground flex items-center px-3 py-2 text-left text-xs font-medium whitespace-nowrap"
            >
              {header.isPlaceholder
                ? null
                : flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
            </div>
          )),
        )}
      </div>

      <div
        role="rowgroup"
        className="relative min-w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index];
          if (!row) return null;

          return (
            <div
              key={row.id}
              role="row"
              aria-selected={row.getIsSelected()}
              data-state={row.getIsSelected() ? "selected" : undefined}
              className="border-border data-[state=selected]:bg-muted/50 hover:bg-muted/30 absolute top-0 left-0 grid w-full items-center border-b"
              style={{
                gridTemplateColumns,
                height: virtualRow.size,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {row.getVisibleCells().map((cell) => (
                <div
                  key={cell.id}
                  role="cell"
                  className="truncate px-3 py-2 text-sm"
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
