import "server-only";

/**
 * Raised for any non-recoverable geo-provider API failure (HTTP-level
 * or an API-reported error status) — Nominatim (geocoding) or Overpass
 * (business search/details). Zero-result outcomes are *not* errors
 * (callers get `null`/`[]`); this is reserved for things a caller
 * should actually treat as a failure (transport failure, quota/rate
 * limiting, malformed response).
 */
export class GeoApiError extends Error {
  readonly httpStatus: number;

  constructor(message: string, httpStatus: number, cause?: unknown) {
    super(message, { cause });
    this.name = "GeoApiError";
    this.httpStatus = httpStatus;
  }
}
