import "server-only";
import { z } from "zod";

import { generateStructured } from "./generate-structured";
import { resolveModel } from "./providers";
import type { AiProvider } from "./types";

const VALIDATION_SCHEMA = z.object({ ok: z.boolean() });

/**
 * Settings' "validate on save" (architecture.md §3 Settings: "Keys are
 * validated on save and stored encrypted at rest", §7.2's pattern
 * extended to AI keys per Sprint 5's deliverable list). Deliberately
 * the smallest request that still proves the whole path works: the
 * key authenticates, the model is reachable, and structured
 * generation succeeds end-to-end through `generateStructured` — not
 * just a bare completion call, and not a large prompt/response.
 * Nothing here is persisted (no `ai_results` write, no timestamp
 * anywhere) — this is pure, immediate feedback for one form
 * submission, gone as soon as the request completes.
 *
 * Imported by `modules/settings/index.ts` via this exact file path
 * (`@/modules/ai/validate-key`), **not** the `@/modules/ai` barrel.
 * `modules/ai/audit.ts` and `opportunity.ts` already import
 * `getDecryptedKeys` from `modules/settings` — if settings imported
 * the barrel here, the module graph would be settings → ai (barrel)
 * → audit.ts → settings, a real circular dependency. This file only
 * imports `./generate-structured` and `./providers`, neither of which
 * depends on `modules/settings`, so no cycle exists at the actual
 * file level. Still re-exported from the barrel for any other
 * consumer that doesn't have this constraint.
 */
export async function validateAiProviderKey(
  provider: AiProvider,
  apiKey: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const model = resolveModel(provider, apiKey);

  const result = await generateStructured({
    model,
    systemPrompt: "Respond with only the requested JSON object.",
    userPrompt: 'Reply with {"ok": true} to confirm this connection works.',
    schema: VALIDATION_SCHEMA,
  });

  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}
