import "server-only";

import { GEO_API_TIMEOUT_MS } from "@/config/constants";

/**
 * Same "caller signal + default timeout" composition as
 * `modules/intelligence/analysis/guarded-fetch.ts`'s `guardedFetch` —
 * a default `AbortSignal.timeout` so a hung Nominatim/Overpass call is
 * bounded even when a caller doesn't pass its own signal, combined via
 * `AbortSignal.any` when one is passed.
 */
export function resolveRequestSignal(callerSignal?: AbortSignal): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(GEO_API_TIMEOUT_MS);
  return callerSignal
    ? AbortSignal.any([callerSignal, timeoutSignal])
    : timeoutSignal;
}
