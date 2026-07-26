import "server-only";
import { fetch as undiciFetch } from "undici";

import {
  ANALYZER_MAX_REDIRECTS,
  ANALYZER_MAX_RESPONSE_BYTES,
  ANALYZER_TIMEOUT_MS,
  ANALYZER_USER_AGENT,
} from "@/config/constants";

import { assertAllowedProtocol, sharedSsrfSafeDispatcher } from "./ssrf-guard";

/**
 * SSRF-guarded, timeout-bounded, redirect-capped, size-capped HTTP GET
 * (architecture.md §9.1 [1 Acquire]). Uses `undici`'s own `fetch`
 * directly, not the Node/DOM global — its `RequestInit` is properly
 * typed for the `dispatcher` option `ssrf-guard.ts` requires, and using
 * the same package for both keeps the fetch and the `Agent` guaranteed
 * to be the same implementation, not just structurally compatible ones.
 *
 * Redirects are followed **manually** (`redirect: "manual"`, a loop
 * here) rather than via `redirect: "follow"` — the built-in follower
 * has no hop-count limit to enforce "cap redirects", and re-resolving
 * `assertAllowedProtocol` (and, through the dispatcher, `safeLookup`)
 * on every hop is what stops a redirect chain from being used to reach
 * a target the *original* URL's check would have blocked.
 */

export class AnalyzerFetchError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "AnalyzerFetchError";
  }
}

export type FetchedResource = {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: string;
  bytesRead: number;
  redirectCount: number;
  elapsedMs: number;
};

export type GuardedFetchOptions = {
  timeoutMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
  signal?: AbortSignal;
};

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** Reads the body as text, aborting once `maxBytes` is exceeded rather
 * than buffering an unbounded (or merely huge) response in memory. */
async function readBodyWithLimit(
  response: Awaited<ReturnType<typeof undiciFetch>>,
  maxBytes: number,
): Promise<{ body: string; bytesRead: number }> {
  if (!response.body) return { body: "", bytesRead: 0 };

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        throw new AnalyzerFetchError(
          `Response body exceeded the ${maxBytes}-byte limit`,
        );
      }
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  const combined = new Uint8Array(bytesRead);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return {
    body: new TextDecoder("utf-8", { fatal: false }).decode(combined),
    bytesRead,
  };
}

export async function guardedFetch(
  targetUrl: string,
  options?: GuardedFetchOptions,
): Promise<FetchedResource> {
  const timeoutMs = options?.timeoutMs ?? ANALYZER_TIMEOUT_MS;
  const maxRedirects = options?.maxRedirects ?? ANALYZER_MAX_REDIRECTS;
  const maxBytes = options?.maxBytes ?? ANALYZER_MAX_RESPONSE_BYTES;

  const startedAt = Date.now();
  let currentUrl = targetUrl;
  let redirectCount = 0;

  for (;;) {
    let parsed: URL;
    try {
      parsed = new URL(currentUrl);
    } catch {
      throw new AnalyzerFetchError(`Invalid URL: ${currentUrl}`);
    }
    assertAllowedProtocol(parsed);

    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = options?.signal
      ? AbortSignal.any([options.signal, timeoutSignal])
      : timeoutSignal;

    let response: Awaited<ReturnType<typeof undiciFetch>>;
    try {
      response = await undiciFetch(parsed, {
        redirect: "manual",
        signal,
        headers: { "User-Agent": ANALYZER_USER_AGENT },
        dispatcher: sharedSsrfSafeDispatcher,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new AnalyzerFetchError(
          `Request to ${currentUrl} timed out after ${timeoutMs}ms`,
          error,
        );
      }
      throw new AnalyzerFetchError(`Request to ${currentUrl} failed`, error);
    }

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        throw new AnalyzerFetchError(
          `${currentUrl} responded ${response.status} with no Location header`,
        );
      }
      if (redirectCount >= maxRedirects) {
        throw new AnalyzerFetchError(
          `Exceeded ${maxRedirects} redirects starting from ${targetUrl}`,
        );
      }
      redirectCount += 1;
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    const { body, bytesRead } = await readBodyWithLimit(response, maxBytes);
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return {
      requestedUrl: targetUrl,
      finalUrl: currentUrl,
      status: response.status,
      ok: response.ok,
      headers,
      body,
      bytesRead,
      redirectCount,
      elapsedMs: Date.now() - startedAt,
    };
  }
}
