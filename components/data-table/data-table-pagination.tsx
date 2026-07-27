import { Button } from "@/components/ui/button";

/**
 * Pagination controls over a numeric page window. Purely
 * presentational — the caller owns the page-start state and re-fetches;
 * this just renders the current window and two buttons.
 *
 * Prop names are deliberately neutral (`pageStart`, not `cursor`) —
 * architecture.md §12.3 specifies **cursor** pagination for large/shared
 * collections (`businesses`) but **offset** pagination for small bounded
 * user lists (favorites, lead lists). This component is the shared UI
 * for both: Discovery (Sprint 2) calls it with its cursor value, a
 * future Favorites/Lead list (Sprint 4) would call it with an offset —
 * same numeric-window mechanics either way, so the component itself
 * shouldn't imply one over the other. "Previous" is safe to offer even
 * for Discovery's cursor, which the API only ever advances forward: a
 * lower page-start re-issues the same search, which is a `search_cache`
 * hit for anything already fetched (architecture.md §6.2), never a new
 * provider call.
 */
export type DataTablePaginationProps = {
  pageStart: number;
  pageSize: number;
  totalCount: number;
  hasNextPage: boolean;
  onPreviousPage: () => void;
  onNextPage: () => void;
  disabled?: boolean;
};

export function DataTablePagination({
  pageStart,
  pageSize,
  totalCount,
  hasNextPage,
  onPreviousPage,
  onNextPage,
  disabled = false,
}: DataTablePaginationProps) {
  const rangeStart = totalCount === 0 ? 0 : pageStart + 1;
  const rangeEnd = Math.min(pageStart + pageSize, totalCount);

  return (
    <div className="flex flex-col-reverse items-center justify-between gap-3 sm:flex-row">
      <p className="text-muted-foreground text-sm">
        {totalCount === 0
          ? "No results"
          : `Showing ${rangeStart}–${rangeEnd} of ${totalCount}${hasNextPage ? "+" : ""}`}
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onPreviousPage}
          disabled={disabled || pageStart <= 0}
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
