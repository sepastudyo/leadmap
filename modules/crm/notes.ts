import "server-only";

import { getBusinessById } from "@/modules/discovery";

import { BusinessNotFoundError } from "./errors";
import {
  createNote,
  getNoteById,
  listNotesByBusiness,
  softDeleteNote,
  updateNote,
  type Note,
  type NotePatch,
} from "./notes-repository";

/**
 * Notes orchestration (architecture.md §3 Lead Organization: "attach
 * notes"). Phase 4.1 built the capability; Phase 4.2
 * (`/api/businesses/{id}/notes`) is the first caller.
 */

export class NoteNotFoundError extends Error {
  constructor() {
    super("Note not found.");
    this.name = "NoteNotFoundError";
  }
}

export async function addNote(
  userId: string,
  businessId: string,
  body: string,
): Promise<Note> {
  const business = await getBusinessById(businessId);
  if (!business) throw new BusinessNotFoundError();

  return createNote(userId, businessId, body);
}

/** Also used for pin/unpin — a pin toggle is just a patch of `{ pinned }`. */
export async function editNote(
  userId: string,
  noteId: string,
  patch: NotePatch,
): Promise<Note> {
  const note = await updateNote(userId, noteId, patch);
  if (!note) throw new NoteNotFoundError();
  return note;
}

export async function removeNote(
  userId: string,
  noteId: string,
): Promise<void> {
  const existing = await getNoteById(userId, noteId);
  if (!existing) throw new NoteNotFoundError();
  await softDeleteNote(userId, noteId);
}

export async function getNotesForBusiness(
  userId: string,
  businessId: string,
): Promise<Note[]> {
  return listNotesByBusiness(userId, businessId);
}
