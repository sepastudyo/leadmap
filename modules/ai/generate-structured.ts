import "server-only";
import { NoObjectGeneratedError, generateObject, type LanguageModel } from "ai";
import type { z } from "zod";

import {
  AI_REQUEST_TIMEOUT_MS,
  AI_STRUCTURED_OUTPUT_MAX_REPAIR_ATTEMPTS,
  AI_TRANSIENT_ERROR_MAX_RETRIES,
} from "@/config/constants";

/**
 * The provider adapter interface (architecture.md §11.1: "A single
 * provider adapter interface (`generateStructured`) is implemented for
 * each provider. Business code depends on *our* interface, never a
 * vendor SDK"). Every AI Audit / Opportunity Reasoning call (Sprint 5,
 * later phases) goes through this one function regardless of which
 * provider the user configured — `resolveModel` (`providers.ts`) is
 * the only place that touches `@ai-sdk/*` directly.
 */

export type GenerateStructuredInput<T> = {
  model: LanguageModel;
  systemPrompt: string;
  userPrompt: string;
  schema: z.ZodType<T>;
};

export type GenerateStructuredResult<T> =
  { ok: true; data: T } | { ok: false; error: string };

const REPAIR_NOTE =
  "Your previous response did not match the required JSON schema. Return only valid JSON that matches the schema exactly — no prose, no markdown fences.";

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown AI provider error.";
}

async function attempt<T>(
  input: GenerateStructuredInput<T>,
  repairNote?: string,
): Promise<T> {
  const { object } = await generateObject({
    model: input.model,
    schema: input.schema,
    system: repairNote
      ? `${input.systemPrompt}\n\n${repairNote}`
      : input.systemPrompt,
    prompt: input.userPrompt,
    abortSignal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS),
    maxRetries: AI_TRANSIENT_ERROR_MAX_RETRIES,
  });
  return object;
}

/**
 * architecture.md §11.3: structured output validated with Zod;
 * `AI_STRUCTURED_OUTPUT_MAX_REPAIR_ATTEMPTS` (1) repair retry on an
 * invalid response; graceful `{ ok: false }` on hard failure — the app
 * never breaks when AI does. Transient transport errors (timeouts,
 * 5xx) are retried by the AI SDK itself via `maxRetries`, independent
 * of the repair retry here, which is specifically about invalid
 * *content* from an otherwise-successful call.
 */
export async function generateStructured<T>(
  input: GenerateStructuredInput<T>,
): Promise<GenerateStructuredResult<T>> {
  let lastError: unknown;

  for (
    let attemptIndex = 0;
    attemptIndex <= AI_STRUCTURED_OUTPUT_MAX_REPAIR_ATTEMPTS;
    attemptIndex++
  ) {
    try {
      const data = await attempt(
        input,
        attemptIndex > 0 ? REPAIR_NOTE : undefined,
      );
      return { ok: true, data };
    } catch (error) {
      lastError = error;
      // Only a schema-validation failure is worth a repair retry — a
      // transport/auth error will fail the same way again.
      if (!NoObjectGeneratedError.isInstance(error)) break;
    }
  }

  return { ok: false, error: describeError(lastError) };
}
