import { NextResponse } from "next/server";

import { jsonData, jsonError, requireSession } from "@/lib/http";
import { idParamSchema, updateNoteSchema } from "@/lib/validation";
import { NoteNotFoundError, editNote, removeNote } from "@/modules/crm";

/**
 * `PATCH/DELETE /api/notes/{id}` — edit a note's body and/or pin/unpin
 * it (a pin toggle is just a `{ pinned }` patch), and remove it
 * (architecture.md §3 Lead Organization: "attach notes ... pin/unpin").
 * Not in architecture.md §12.5's endpoint table, which the section
 * itself labels "Representative" — added here as the minimal extension
 * Sprint 4's own deliverable list ("attach/edit notes ... pin/unpin")
 * requires beyond plain creation.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { userId, requestId } = session;

  const parsedParams = idParamSchema.safeParse(await params);
  if (!parsedParams.success) {
    return jsonError("VALIDATION_ERROR", "Invalid note id.", requestId, 422, {
      details: parsedParams.error.issues,
    });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateNoteSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(
      "VALIDATION_ERROR",
      "Invalid note update.",
      requestId,
      422,
      {
        details: parsed.error.issues,
      },
    );
  }

  try {
    const data = await editNote(userId, parsedParams.data.id, parsed.data);
    return jsonData(data, requestId);
  } catch (error) {
    if (error instanceof NoteNotFoundError) {
      return jsonError("NOTE_NOT_FOUND", error.message, requestId, 404);
    }
    throw error;
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { userId, requestId } = session;

  const parsedParams = idParamSchema.safeParse(await params);
  if (!parsedParams.success) {
    return jsonError("VALIDATION_ERROR", "Invalid note id.", requestId, 422, {
      details: parsedParams.error.issues,
    });
  }

  try {
    await removeNote(userId, parsedParams.data.id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof NoteNotFoundError) {
      return jsonError("NOTE_NOT_FOUND", error.message, requestId, 404);
    }
    throw error;
  }
}
