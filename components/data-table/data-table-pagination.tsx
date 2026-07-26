import { Button } from "@/components/ui/button";

/**
 * Cursor pagination controls (architecture.md §12.3 "cursor-based for
 * large/shared collections"). Purely presentational — the caller owns
 * the cursor state and re-fetches; this just renders the current
 * window and two buttons. "Previous" is safe to offer even though
 * `/api/discovery/search` only ever returns a forward `next_cursor`:
 * a lower cursor re-issues the same search, which is a `search_cache`
 * hit for anything already fetched (architecture.md §6.2), never a new
 * Google call.
 */
export type DataTablePaginationProps = {
  cursor: number;
  pageSize: number;
  totalCached: number;
  hasNextPage: boolean;
  onPreviousPage: () => void;
  onNextPage: () => void;
  disabled?: boolean;
};

export function DataTablePagination({
  cursor,
  pageSize,
  totalCached,
  hasNextPage,
  onPreviousPage,
  onNextPage,
  disabled = false,
}: DataTablePaginationProps) {
  const rangeStart = totalCached === 0 ? 0 : cursor + 1;
  const rangeEnd = Math.min(cursor + pageSize, totalCached);

  return (
    <div className="flex flex-col-reverse items-center justify-between gap-3 sm:flex-row">
      <p className="text-muted-foreground text-sm">
        {totalCached === 0
          ? "No results"
          : `Showing ${rangeStart}–${rangeEnd} of ${totalCached}${hasNextPage ? "+" : ""}`}
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onPreviousPage}
          disabled={disabled || cursor <= 0}
        >
          Previous
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onNextPage}
          disabled={disabled || !hasNextPage}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
