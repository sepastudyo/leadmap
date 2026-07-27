"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FavoriteStatus } from "@/modules/crm";

export type FavoriteDto = {
  id: string;
  status: FavoriteStatus;
  priority: number | null;
  /** ISO `YYYY-MM-DD`, matching the `favorites.follow_up_at` column. */
  followUpAt: string | null;
};

export type FavoritePanelProps = {
  businessId: string;
  initialFavorite: FavoriteDto | null;
};

const STATUS_OPTIONS: { value: FavoriteStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "reviewing", label: "Reviewing" },
  { value: "qualified", label: "Qualified" },
  { value: "not_fit", label: "Not a fit" },
  { value: "won", label: "Won" },
];

type ErrorResponseBody = { error?: { code?: string; message?: string } };

const SELECT_CLASS =
  "border-input h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-50";

/**
 * Save a business as a lead, then edit its status/priority/follow-up
 * date (architecture.md §3 Lead Organization: "favorite a business ...
 * status ... priority ... follow-up date"). Purely a thin client over
 * `/api/favorites` (Phase 4.2) — every change is a direct `fetch`; no
 * business rules (ownership, valid status values, soft-delete
 * semantics) are re-implemented here, all of it stays server-side.
 */
export function FavoritePanel({
  businessId,
  initialFavorite,
}: FavoritePanelProps) {
  const [favorite, setFavorite] = React.useState(initialFavorite);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId }),
      });
      const json: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const body = json as ErrorResponseBody | null;
        setError(body?.error?.message ?? "Couldn't save this lead.");
        return;
      }

      setFavorite((json as { data: FavoriteDto }).data);
    } catch {
      setError("Network error — check your connection and try again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUnsave() {
    if (!favorite) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/favorites/${favorite.id}`, {
        method: "DELETE",
      });

      if (!response.ok && response.status !== 204) {
        const json: unknown = await response.json().catch(() => null);
        const body = json as ErrorResponseBody | null;
        setError(body?.error?.message ?? "Couldn't unsave this lead.");
        return;
      }

      setFavorite(null);
    } catch {
      setError("Network error — check your connection and try again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePatch(patch: Record<string, unknown>) {
    if (!favorite) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/favorites/${favorite.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const body = json as ErrorResponseBody | null;
        setError(body?.error?.message ?? "Couldn't update this lead.");
        return;
      }

      setFavorite((json as { data: FavoriteDto }).data);
    } catch {
      setError("Network error — check your connection and try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="border-border rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Lead</h2>
        <Button
          type="button"
          size="sm"
          variant={favorite ? "outline" : "default"}
          disabled={isSaving}
          onClick={favorite ? handleUnsave : handleSave}
        >
          {isSaving ? "Saving…" : favorite ? "Saved — unsave" : "Save as lead"}
        </Button>
      </div>

      {error && <p className="text-destructive mt-2 text-sm">{error}</p>}

      {favorite && (
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="favorite-status">Status</Label>
            <select
              id="favorite-status"
              className={SELECT_CLASS}
              value={favorite.status}
              disabled={isSaving}
              onChange={(event) => handlePatch({ status: event.target.value })}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* architecture.md defines priority only as "nullable int" —
              no fixed scale/labels are specified, so this is a plain
              integer input rather than an invented set of levels. */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="favorite-priority">Priority</Label>
            <Input
              key={`priority-${favorite.priority}`}
              id="favorite-priority"
              type="number"
              disabled={isSaving}
              defaultValue={favorite.priority ?? ""}
              onBlur={(event) => {
                const raw = event.target.value.trim();
                const next = raw === "" ? null : Number(raw);
                if (next === favorite.priority) return;
                handlePatch({ priority: next });
              }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="favorite-follow-up">Follow-up date</Label>
            <Input
              id="favorite-follow-up"
              type="date"
              disabled={isSaving}
              value={favorite.followUpAt ?? ""}
              onChange={(event) =>
                handlePatch({ followUpAt: event.target.value || null })
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
