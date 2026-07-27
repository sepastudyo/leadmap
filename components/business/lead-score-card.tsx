import type { ScoreBreakdownEntry } from "@/modules/intelligence";

export type LeadScoreCardProps = {
  score: {
    total: number;
    breakdown: ScoreBreakdownEntry[];
    rulesetVersion: number;
  } | null;
};

/**
 * Explainable Lead Score (architecture.md §10.2 "Explainability: the
 * stored `breakdown` (which rules fired, points, and a human reason) is
 * shown in the UI so agencies see *why* a business scores as it does").
 * Server Component — no interactivity, just rendering an already-computed
 * `LeadScoreResult` (`getOrComputeLeadScore`).
 */
export function LeadScoreCard({ score }: LeadScoreCardProps) {
  if (!score) {
    return (
      <div className="border-border rounded-lg border border-dashed p-4 lg:col-span-2">
        <h2 className="text-sm font-medium">Lead Score</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          No scoring ruleset is published yet.
        </p>
      </div>
    );
  }

  return (
    <div className="border-border rounded-lg border p-4 lg:col-span-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium">Lead Score</h2>
        <span className="text-muted-foreground text-xs">
          ruleset v{score.rulesetVersion}
        </span>
      </div>
      <p className="mt-1 text-3xl font-semibold">{score.total}</p>

      <ul className="mt-3 flex flex-col gap-1.5">
        {score.breakdown.map((entry) => (
          <li key={entry.key} className="flex items-start gap-2 text-sm">
            <span
              className={
                entry.matched
                  ? "mt-0.5 text-emerald-600 dark:text-emerald-400"
                  : "text-muted-foreground mt-0.5"
              }
              aria-hidden
            >
              {entry.matched ? "✓" : "–"}
            </span>
            <span className={entry.matched ? "" : "text-muted-foreground"}>
              {entry.reason}
              {entry.matched && (
                <span className="text-muted-foreground">
                  {" "}
                  (+{entry.points})
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
