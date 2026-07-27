"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export type RefreshPanelProps = {
  businessId: string;
};

type ErrorResponseBody = { error?: { code?: string; message?: string } };
type PostResult = { ok: true } | { ok: false; message: string };

async function postRefresh(path: string): Promise<PostResult> {
  try {
    const response = await fetch(path, { method: "POST" });
    if (response.ok) return { ok: true };

    const json: unknown = await response.json().catch(() => null);
    const body = json as ErrorResponseBody | null;
    return { ok: false, message: body?.error?.message ?? "Refresh failed." };
  } catch {
    return {
      ok: false,
      message: "Network error — check your connection and try again.",
    };
  }
}

/**
 * Manual force-refresh (Sprint 7 Phase 7.6; architecture.md §6.4
 * "Manual: a user can force-refresh a business (re-fetch details,
 * re-run analysis) — an explicit, user-triggered invalidation that
 * respects rate limits"). Calls the two new routes sequentially — Place
 * Details first, so a just-updated website URL is what Website Analysis
 * (which looks the business up itself) actually sees — then
 * `router.refresh()` to re-render the page's Server Component with
 * whatever changed. No client-side state to reconcile: every value this
 * page shows (Google Signals, Analysis Summary) already comes from the
 * RSC's own read, which `router.refresh()` simply re-runs.
 */
export function RefreshPanel({ businessId }: RefreshPanelProps) {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleRefresh() {
    setIsRefreshing(true);
    setError(null);

    const detailsResult = await postRefresh(
      `/api/businesses/${businessId}/details`,
    );
    const analyzeResult = await postRefresh(
      `/api/businesses/${businessId}/analyze`,
    );

    const firstFailure = [detailsResult, analyzeResult].find(
      (result): result is { ok: false; message: string } => !result.ok,
    );
    if (firstFailure) setError(firstFailure.message);

    router.refresh();
    setIsRefreshing(false);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isRefreshing}
        onClick={handleRefresh}
      >
        {isRefreshing ? "Refreshing…" : "Refresh"}
      </Button>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
