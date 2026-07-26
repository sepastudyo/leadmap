import "server-only";

/**
 * Raised for any non-recoverable Google Maps Platform API failure
 * (HTTP-level or an API-reported error status) — architecture.md §7.
 * Zero-result outcomes are *not* errors (callers get `null`/`[]`); this
 * is reserved for things a caller should actually treat as a failure
 * (bad key, quota exhausted, malformed response).
 */
export class GoogleApiError extends Error {
  readonly httpStatus: number;

  constructor(message: string, httpStatus: number, cause?: unknown) {
    super(message, { cause });
    this.name = "GoogleApiError";
    this.httpStatus = httpStatus;
  }
}
