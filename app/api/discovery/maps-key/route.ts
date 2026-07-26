import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getDecryptedKeys } from "@/modules/settings";

/**
 * `GET /api/discovery/maps-key` — a narrow, dedicated endpoint whose
 * only job is handing the Maps JavaScript API **browser key** to the
 * client (architecture.md §7.1 "Maps JavaScript API | Client-side |
 * ... rendered live with the user's referrer-restricted browser key",
 * §7.2). This is a deliberately separate code path from anything that
 * touches the server-side Places/Geocoding key's *use* — that key is
 * decrypted server-side only inside `modules/discovery/search.ts` and
 * never returned from any route. The value handed back here happens to
 * be the same stored key when a user configures only one ("the user
 * may use one appropriately-restricted key or two keys; the app
 * supports both" — §7.2; this schema, per Sprint 1, stores one), but
 * the response shape is intentionally minimal — just the key, nothing
 * else from `user_settings` — so this endpoint can never leak anything
 * beyond exactly what Map View needs.
 *
 * Sending a Maps JS key to the browser is not a leak: architecture.md
 * §7.2 states browser keys are "exposed to the client by necessity
 * (all Maps-JS keys are)" — the security boundary for this key is
 * Google's own HTTP-referrer restriction, configured by the user in
 * Google Cloud Console, not secrecy on our side.
 */
export async function GET() {
  const requestId = randomUUID();
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      {
        error: { code: "UNAUTHORIZED", message: "Sign in required." },
        request_id: requestId,
      },
      { status: 401 },
    );
  }

  const settings = await getDecryptedKeys(session.user.id);

  if (!settings) {
    return NextResponse.json(
      {
        error: {
          code: "GOOGLE_API_KEY_MISSING",
          message: "Save a Google API key in Settings before using the map.",
        },
        request_id: requestId,
      },
      { status: 422 },
    );
  }

  return NextResponse.json({
    data: { googleApiKey: settings.googleApiKey },
    request_id: requestId,
  });
}
