import { NextResponse } from "next/server";

import { jsonData, jsonError, requireSession } from "@/lib/http";
import {
  createFavoriteSchema,
  listFavoritesQuerySchema,
} from "@/lib/validation";
import {
  BusinessNotFoundError,
  FavoriteAlreadyExistsError,
  favoriteBusiness,
  getLeadsForUser,
} from "@/modules/crm";

/**
 * `GET/POST /api/favorites` (architecture.md §12.5 "List / create saved
 * leads"). `GET` is offset-paginated per §12.3 ("offset for small
 * bounded user lists") and, as of Sprint 4 Phase 4.4 (its first real
 * caller — the Leads page), returns each favorite joined with its
 * business name and Lead Score via `getLeadsForUser`, since neither
 * field lives on `favorites` itself and the Leads page's own
 * deliverable requires both. This is additive to the response body
 * only — the request contract (query params, auth) and every other
 * verb on this resource (`POST` here, `PATCH`/`DELETE` on
 * `/api/favorites/{id}`) are unchanged. `POST` is create-only — a
 * repeat call for the same business 409s rather than unsaving it; see
 * `modules/crm/favorites.ts`'s `favoriteBusiness` doc comment for why
 * this is kept separate from the also-exported `toggleFavorite`.
 */
export async function GET(request: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { userId, requestId } = session;

  const { searchParams } = new URL(request.url);
  const parsed = listFavoritesQuerySchema.safeParse({
    limit: searchParams.get("limit") ?? undefined,
    offset: searchParams.get("offset") ?? undefined,
  });

  if (!parsed.success) {
    return jsonError(
      "VALIDATION_ERROR",
      "Invalid pagination parameters.",
      requestId,
      422,
      { details: parsed.error.issues },
    );
  }

  const { limit, offset } = parsed.data;
  const { items, totalCount } = await getLeadsForUser(userId, {
    limit,
    offset,
  });

  return jsonData(items, requestId, {
    meta: { limit, offset, total_count: totalCount },
  });
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { userId, requestId } = session;

  const body = await request.json().catch(() => null);
  const parsed = createFavoriteSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(
      "VALIDATION_ERROR",
      "Invalid favorite input.",
      requestId,
      422,
      { details: parsed.error.issues },
    );
  }

  try {
    const data = await favoriteBusiness(userId, parsed.data.businessId);
    return jsonData(data, requestId, { status: 201 });
  } catch (error) {
    if (error instanceof BusinessNotFoundError) {
      return jsonError("BUSINESS_NOT_FOUND", error.message, requestId, 404);
    }
    if (error instanceof FavoriteAlreadyExistsError) {
      return jsonError(
        "FAVORITE_ALREADY_EXISTS",
        error.message,
        requestId,
        409,
      );
    }
    throw error;
  }
}
