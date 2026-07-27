export type BusinessSignalsProps = {
  business: {
    category: string;
    googleRating: number | null;
    googleReviewCount: number | null;
    phone: string | null;
    websiteUrl: string | null;
    placeSummary: unknown;
  };
};

function formatHours(placeSummary: unknown): string[] | null {
  if (
    placeSummary !== null &&
    typeof placeSummary === "object" &&
    "hours" in placeSummary &&
    Array.isArray((placeSummary as { hours: unknown }).hours)
  ) {
    return (placeSummary as { hours: string[] }).hours;
  }
  return null;
}

/**
 * Business signals (architecture.md §17 Sprint 3 deliverable: "Google
 * Business signals (rating, review count, category, presence)",
 * renamed after the OpenStreetMap migration since the data no longer
 * comes from Google — `presence` = has a phone / website / hours on
 * file, distinct from the Website Analyzer's own presence signals).
 * `business.googleRating`/`googleReviewCount` keep their original prop
 * names (see `modules/discovery/businesses-repository.ts`'s own
 * comment) but are always `null` now — OSM has no ratings/review-count
 * concept — which this component already rendered as "—" for any
 * business Google itself had never rated, so no behavior change here.
 */
export function BusinessSignals({ business }: BusinessSignalsProps) {
  const hours = formatHours(business.placeSummary);

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="text-sm font-medium">Business signals</h2>

      <dl className="mt-3 flex flex-col gap-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Rating</dt>
          <dd>
            {business.googleRating !== null
              ? `${business.googleRating.toFixed(1)}${
                  business.googleReviewCount !== null
                    ? ` (${business.googleReviewCount} reviews)`
                    : ""
                }`
              : "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Category</dt>
          <dd className="text-right">{business.category}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Phone</dt>
          <dd>{business.phone ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Website</dt>
          <dd>{business.websiteUrl ? "Yes" : "—"}</dd>
        </div>
        {hours && hours.length > 0 && (
          <div>
            <dt className="text-muted-foreground">Hours</dt>
            <dd className="mt-1 flex flex-col gap-0.5">
              {hours.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
