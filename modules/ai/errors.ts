/**
 * Shared across every AI feature (AI Audit now; Opportunity Reasoning
 * later) — both need the identical "no key configured" and "the
 * provider call didn't work out" conditions, so these live here rather
 * than being redefined per feature.
 */

export class AiKeyMissingError extends Error {
  constructor() {
    super("Save an AI provider API key in Settings to use this feature.");
    this.name = "AiKeyMissingError";
  }
}

/**
 * Deliberately generic — architecture.md §11's AI layer must never
 * expose a provider-specific error to the client (rate limits, auth
 * failures, content-policy rejections, malformed responses all
 * collapse to this same message). The real error is still reported via
 * `captureException` at the call site before this is thrown.
 */
export class AiGenerationFailedError extends Error {
  constructor() {
    super("AI is temporarily unavailable. Try again shortly.");
    this.name = "AiGenerationFailedError";
  }
}
