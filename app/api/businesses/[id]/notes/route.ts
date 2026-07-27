import { NextResponse } from "next/server";

import { jsonData, jsonError, requireSession } from "@/lib/http";
import { createNoteSchema } from "@/lib/validation";
import { BusinessNotFoundError, addNote } from "@/modules/crm";

/**
 * `POST /api/businesses/{id}/notes` (architecture.md §12.5 "Add note").
 * Nested under the business it belongs to, matching architecture.md
 * §12.1's resource-path examples ("`/api/businesses/{id}/notes`");
 * editing/pinning/removing a specific note (Sprint 4's other note
 * deliverables) address it directly by its own id instead
 * (`/api/notes/{id}`), the same flat-by-id shape `/api/favorites/{id}`
 * already uses.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { userId, requestId } = session;

  const { id: businessId } = await params;

  const body = await request.json().catch(() => null);
  const parsed = createNoteSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(
      "VALIDATION_ERROR",
      "Invalid note input.",
      requestId,
      422,
      {
        details: parsed.error.issues,
      },
    );
  }

  try {
    const data = await addNote(userId, businessId, parsed.data.body);
    return jsonData(data, requestId, { status: 201 });
  } catch (error) {
    if (error instanceof BusinessNotFoundError) {
      return jsonError("BUSINESS_NOT_FOUND", error.message, requestId, 404);
    }
    throw error;
  }
}
