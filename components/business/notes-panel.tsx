"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";

export type NoteDto = {
  id: string;
  body: string;
  pinned: boolean;
  /** ISO timestamp. */
  createdAt: string;
};

export type NotesPanelProps = {
  businessId: string;
  initialNotes: NoteDto[];
};

type ErrorResponseBody = { error?: { code?: string; message?: string } };

const TEXTAREA_CLASS =
  "border-input min-h-16 w-full rounded-lg border bg-transparent p-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-50";

/**
 * Mirrors `modules/crm/notes-repository.ts`'s `listNotesByBusiness`
 * ordering (pinned first, then newest first) — pure display ordering
 * applied to data the server already returned; not a business rule
 * (what counts as "pinned" or "created" is decided server-side).
 */
function sortNotes(notes: NoteDto[]): NoteDto[] {
  return [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/**
 * Notes list + add/edit/pin (architecture.md §3 Lead Organization:
 * "attach notes ... pin/unpin"). Thin client over
 * `/api/businesses/{id}/notes` (create) and `/api/notes/{id}`
 * (edit/pin) — Phase 4.2's existing routes, no new API surface.
 */
export function NotesPanel({ businessId, initialNotes }: NotesPanelProps) {
  const [notes, setNotes] = React.useState(() => sortNotes(initialNotes));
  const [draft, setDraft] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editDraft, setEditDraft] = React.useState("");

  async function handleAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/businesses/${businessId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const json: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const responseBody = json as ErrorResponseBody | null;
        setError(responseBody?.error?.message ?? "Couldn't add note.");
        return;
      }

      const added = (json as { data: NoteDto }).data;
      setNotes((current) => sortNotes([added, ...current]));
      setDraft("");
    } catch {
      setError("Network error — check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function patchNote(id: string, patch: Record<string, unknown>) {
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/notes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const responseBody = json as ErrorResponseBody | null;
        setError(responseBody?.error?.message ?? "Couldn't update note.");
        return;
      }

      const updated = (json as { data: NoteDto }).data;
      setNotes((current) =>
        sortNotes(current.map((note) => (note.id === id ? updated : note))),
      );
    } catch {
      setError("Network error — check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function startEdit(note: NoteDto) {
    setEditingId(note.id);
    setEditDraft(note.body);
  }

  async function saveEdit(id: string) {
    const body = editDraft.trim();
    if (!body) return;
    await patchNote(id, { body });
    setEditingId(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">Notes</h2>

      <form onSubmit={handleAdd} className="flex flex-col gap-2">
        <textarea
          className={TEXTAREA_CLASS}
          placeholder="Add a note…"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={isSubmitting}
        />
        <Button
          type="submit"
          size="sm"
          disabled={isSubmitting || !draft.trim()}
          className="self-start"
        >
          {isSubmitting ? "Adding…" : "Add note"}
        </Button>
      </form>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {notes.length === 0 ? (
        <p className="text-muted-foreground text-sm">No notes yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notes.map((note) => (
            <li key={note.id} className="border-border rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground text-xs">
                  {new Date(note.createdAt).toLocaleDateString()}
                  {note.pinned && " · Pinned"}
                </span>
                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2 disabled:pointer-events-none disabled:opacity-50"
                    onClick={() => patchNote(note.id, { pinned: !note.pinned })}
                  >
                    {note.pinned ? "Unpin" : "Pin"}
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2 disabled:pointer-events-none disabled:opacity-50"
                    onClick={() =>
                      editingId === note.id
                        ? setEditingId(null)
                        : startEdit(note)
                    }
                  >
                    {editingId === note.id ? "Cancel" : "Edit"}
                  </button>
                </div>
              </div>

              {editingId === note.id ? (
                <div className="mt-2 flex flex-col gap-2">
                  <textarea
                    className={TEXTAREA_CLASS}
                    value={editDraft}
                    onChange={(event) => setEditDraft(event.target.value)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={isSubmitting || !editDraft.trim()}
                    className="self-start"
                    onClick={() => saveEdit(note.id)}
                  >
                    {isSubmitting ? "Saving…" : "Save"}
                  </Button>
                </div>
              ) : (
                <p className="mt-1 text-sm whitespace-pre-wrap">{note.body}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
