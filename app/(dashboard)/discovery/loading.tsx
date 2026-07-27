/**
 * Discovery route loading skeleton (architecture.md §4 "(dashboard)/
 * discovery/"). Most of the view's own data fetching happens
 * client-side inside `DiscoveryView`, but this still covers the
 * server-rendered shell while the segment itself streams in.
 */
export default function Loading() {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="bg-muted h-9 w-full max-w-md animate-pulse rounded-lg" />
      <div className="bg-muted h-96 animate-pulse rounded-lg" />
    </div>
  );
}
