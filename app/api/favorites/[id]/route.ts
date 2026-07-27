import { NextResponse } from "next/server";

import { jsonData, jsonError, requireSession } from "@/lib/http";
import { idParamSchema, updateFavoriteSchema } from "@/lib/validation";
import {
  FavoriteNotFoundError,
  unfavorite,
  updateFavoriteDetails,
} from "@/modules/crm";

/**
 * `PATCH/DELETE /api/favorites/{id}` (architecture.md §12.5 "Update
 * status / follow-up / priority"). `DELETE` is "unsave" — the
 * `favorites` row is soft-deleted (Phase 4.1), not the mirror image of
 * `favoriteBusiness`'s `toggleFavorite` counterpart.
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
    return jsonError(
      "VALIDATION_ERROR",
      "Invalid favorite id.",
      requestId,
      422,
      { details: parsedParams.error.issues },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = updateFavoriteSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(
      "VALIDATION_ERROR",
      "Invalid favorite update.",
      requestId,
      422,
      { details: parsed.error.issues },
    );
  }

  try {
    const data = await updateFavoriteDetails(
      userId,
      parsedParams.data.id,
      parsed.data,
    );
    return jsonData(data, requestId);
  } catch (error) {
    if (error instanceof FavoriteNotFoundError) {
      return jsonError("FAVORITE_NOT_FOUND", error.message, requestId, 404);
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
    return jsonError(
      "VALIDATION_ERROR",
      "Invalid favorite id.",
      requestId,
      422,
      { details: parsedParams.error.issues },
    );
  }

  try {
    await unfavorite(userId, parsedParams.data.id);
    // 204 per architecture.md §12.1's code list — no body to envelope.
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof FavoriteNotFoundError) {
      return jsonError("FAVORITE_NOT_FOUND", error.message, requestId, 404);
    }
    throw error;
  }
}
