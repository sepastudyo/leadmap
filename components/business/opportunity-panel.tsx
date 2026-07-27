"use client";

import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export type OpportunityReasoningOutput = {
  isPromisingOpportunity: boolean;
  reasons: string[];
};

export type OpportunityPanelProps = {
  businessId: string;
};

type ErrorResponseBody = { error?: { code?: string; message?: string } };

/**
 * Opportunity Reasoning (architecture.md §11.2 "a structured
 * explanation of why the business is or isn't a promising sales
 * opportunity ... tied to specific signals"). Mirrors
 * `components/business/ai-audit-panel.tsx` exactly (same
 * loading/error/key-missing states, same thin-client-over-fetch
 * shape) — explicitly user-triggered per §11.3, same as Audit; nothing
 * runs until the button is clicked.
 */
export function OpportunityPanel({ businessId }: OpportunityPanelProps) {
  const [result, setResult] = React.useState<OpportunityReasoningOutput | null>(
    null,
  );
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [keyMissing, setKeyMissing] = React.useState(false);
  const [scoreUnavailable, setScoreUnavailable] = React.useState(false);

  async function handleRunReasoning() {
    setIsLoading(true);
    setError(null);
    setKeyMissing(false);
    setScoreUnavailable(false);
    try {
      const response = await fetch(
        `/api/businesses/${businessId}/ai/opportunity`,
        { method: "POST" },
      );
      const json: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const body = json as ErrorResponseBody | null;
        if (body?.error?.code === "AI_KEY_MISSING") {
          setKeyMissing(true);
        } else if (body?.error?.code === "LEAD_SCORE_UNAVAILABLE") {
          setScoreUnavailable(true);
        } else {
          setError(
            body?.error?.message ?? "Couldn't run Opportunity Reasoning.",
          );
        }
        return;
      }

      setResult((json as { data: OpportunityReasoningOutput }).data);
    } catch {
      setError("Network error — check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="border-border rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Opportunity Reasoning</h2>
        <Button
          type="button"
          size="sm"
          disabled={isLoading}
          onClick={handleRunReasoning}
        >
          {isLoading
            ? "Running…"
            : result
              ? "Re-run Opportunity Reasoning"
              : "Run Opportunity Reasoning"}
        </Button>
      </div>

      <p className="text-muted-foreground mt-1 text-sm">
        Uses your configured AI provider key. Identical results are cached and
        reused at no extra cost.
      </p>

      {keyMissing && (
        <p className="border-border bg-muted/40 mt-2 rounded-lg border border-dashed p-3 text-sm">
          Save an AI provider API key in{" "}
          <Link
            href="/settings"
            className="text-primary underline underline-offset-4"
          >
            Settings
          </Link>{" "}
          to run Opportunity Reasoning.
        </p>
      )}

      {scoreUnavailable && (
        <p className="border-border bg-muted/40 mt-2 rounded-lg border border-dashed p-3 text-sm">
          No scoring ruleset is published yet, so there&apos;s no Lead Score to
          reason from.
        </p>
      )}

      {error && <p className="text-destructive mt-2 text-sm">{error}</p>}

      {result && (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-sm font-medium">
            {result.isPromisingOpportunity
              ? "Promising opportunity"
              : "Not a promising opportunity"}
          </p>
          {result.reasons.length === 0 ? (
            <p className="text-muted-foreground text-sm">None noted.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {result.reasons.map((reason, index) => (
                <li key={index}>{reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
