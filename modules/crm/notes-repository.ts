import "server-only";
import { and, desc, eq } from "drizzle-orm";

import { notes } from "@/db/schema";
import { db, notDeleted, type DbClient } from "@/lib/db";

/** `notes` repository (architecture.md §5.2) — same ownership +
 * soft-delete scoping discipline as `favorites-repository.ts`. */

export type Note = typeof notes.$inferSelect;

export type NotePatch = {
  body?: string;
  pinned?: boolean;
};

export async function createNote(
  userId: string,
  businessId: string,
  body: string,
  dbClient: DbClient = db,
) {
  const [note] = await dbClient
    .insert(notes)
    .values({ userId, businessId, body })
    .returning();

  return note;
}

export async function getNoteById(
  userId: string,
  noteId: string,
  dbClient: DbClient = db,
) {
  const [note] = await dbClient
    .select()
    .from(notes)
    .where(
      and(
        eq(notes.id, noteId),
        eq(notes.userId, userId),
        notDeleted(notes.deletedAt),
      ),
    )
    .limit(1);

  return note;
}

/** §5.4 "Note timeline" — pinned first, then newest first, matching
 * `notes_user_business_pinned_created_at_idx`. */
export async function listNotesByBusiness(
  userId: string,
  businessId: string,
  dbClient: DbClient = db,
) {
  return dbClient
    .select()
    .from(notes)
    .where(
      and(
        eq(notes.userId, userId),
        eq(notes.businessId, businessId),
        notDeleted(notes.deletedAt),
      ),
    )
    .orderBy(desc(notes.pinned), desc(notes.createdAt));
}

export async function updateNote(
  userId: string,
  noteId: string,
  patch: NotePatch,
  dbClient: DbClient = db,
) {
  const [note] = await dbClient
    .update(notes)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(notes.id, noteId),
        eq(notes.userId, userId),
        notDeleted(notes.deletedAt),
      ),
    )
    .returning();

  return note;
}

export async function softDeleteNote(
  userId: string,
  noteId: string,
  dbClient: DbClient = db,
) {
  await dbClient
    .update(notes)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(notes.id, noteId),
        eq(notes.userId, userId),
        notDeleted(notes.deletedAt),
      ),
    );
}
