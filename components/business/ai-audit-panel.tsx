"use client";

import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export type AiAuditOutput = {
  strengths: string[];
  weaknesses: string[];
  gaps: string[];
};

export type AiAuditPanelProps = {
  businessId: string;
};

type ErrorResponseBody = { error?: { code?: string; message?: string } };

function AuditList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-muted-foreground text-xs font-medium">{title}</h3>
      {items.length === 0 ? (
        <p className="text-muted-foreground mt-1 text-sm">None noted.</p>
      ) : (
        <ul className="mt-1 flex flex-col gap-1 text-sm">
          {items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * AI Audit (architecture.md §11.2 "structured critique — strengths,
 * weaknesses, and concrete digital-presence gaps"). Explicitly
 * user-triggered (§11.3 "Cost transparency ... explicit triggering
 * keep spend minimal and predictable") — nothing runs until the button
 * is clicked, unlike the always-on Website Analysis section on this
 * same page, which costs nothing to compute. Thin client over
 * `POST /api/businesses/{id}/ai/audit` (Phase 5.2) — no business logic
 * here, just the fetch and its loading/error/result states, the same
 * pattern `FavoritePanel`/`NotesPanel` (Phase 4.3) established.
 */
export function AiAuditPanel({ businessId }: AiAuditPanelProps) {
  const [audit, setAudit] = React.useState<AiAuditOutput | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [keyMissing, setKeyMissing] = React.useState(false);

  async function handleRunAudit() {
    setIsLoading(true);
    setError(null);
    setKeyMissing(false);
    try {
      const response = await fetch(`/api/businesses/${businessId}/ai/audit`, {
        method: "POST",
      });
      const json: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const body = json as ErrorResponseBody | null;
        if (body?.error?.code === "AI_KEY_MISSING") {
          setKeyMissing(true);
        } else {
          setError(body?.error?.message ?? "Couldn't run the AI Audit.");
        }
        return;
      }

      setAudit((json as { data: AiAuditOutput }).data);
    } catch {
      setError("Network error — check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="border-border rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">AI Audit</h2>
        <Button
          type="button"
          size="sm"
          disabled={isLoading}
          onClick={handleRunAudit}
        >
          {isLoading ? "Running…" : audit ? "Re-run AI Audit" : "Run AI Audit"}
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
          to run an AI Audit.
        </p>
      )}

      {error && <p className="text-destructive mt-2 text-sm">{error}</p>}

      {audit && (
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <AuditList title="Strengths" items={audit.strengths} />
          <AuditList title="Weaknesses" items={audit.weaknesses} />
          <AuditList title="Gaps" items={audit.gaps} />
        </div>
      )}
    </div>
  );
}
