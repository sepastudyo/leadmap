/**
 * Business Detail Page loading skeleton — the page's three sequential
 * data fetches (Place Details, Website Analysis, Lead Score) can take
 * several seconds on a cold cache with nothing else on screen
 * otherwise (docs/sprint-3.md technical debt note).
 */
export default function Loading() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="bg-muted h-6 w-64 animate-pulse rounded" />
        <div className="bg-muted h-4 w-40 animate-pulse rounded" />
        <div className="bg-muted h-4 w-52 animate-pulse rounded" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="bg-muted h-40 animate-pulse rounded-lg lg:col-span-1" />
        <div className="bg-muted h-40 animate-pulse rounded-lg lg:col-span-2" />
      </div>

      <div className="bg-muted h-64 animate-pulse rounded-lg" />
    </div>
  );
}
