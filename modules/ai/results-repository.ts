import "server-only";
import { and, eq } from "drizzle-orm";

import { aiResults } from "@/db/schema";
import { db, type DbClient } from "@/lib/db";

import type { AiProvider, AiResultType } from "./types";

/**
 * `ai_results` repository (architecture.md §5.2, §11.3 caching). No
 * `deleted_at` on this table — architecture.md doesn't specify one;
 * it's cached AI output the user paid for, not a user annotation like
 * `favorites`/`notes`, so `modules/crm`'s `notDeleted()` filtering
 * doesn't apply here.
 */

export type AiResult = typeof aiResults.$inferSelect;

export type NewAiResult = {
  userId: string;
  businessId: string;
  type: AiResultType;
  provider: AiProvider;
  promptVersion: string;
  inputHash: string;
  output: unknown;
};

/** architecture.md §11.3 "Identical inputs are never re-billed to the
 * user's key" — the read-through cache check a later phase's
 * orchestration will call before spending a request on the provider. */
export async function getCachedAiResult(
  userId: string,
  businessId: string,
  type: AiResultType,
  inputHash: string,
  dbClient: DbClient = db,
) {
  const [result] = await dbClient
    .select()
    .from(aiResults)
    .where(
      and(
        eq(aiResults.userId, userId),
        eq(aiResults.businessId, businessId),
        eq(aiResults.type, type),
        eq(aiResults.inputHash, inputHash),
      ),
    )
    .limit(1);

  return result;
}

/**
 * Upserts on the same unique key the lookup above reads — identical
 * `(user, business, type, input_hash)` overwrites rather than
 * duplicates. `input_hash` changing (the underlying analysis or score
 * changed) always produces a new row instead, per §6.1's "indefinite
 * until inputs change".
 */
export async function storeAiResult(
  input: NewAiResult,
  dbClient: DbClient = db,
) {
  const [result] = await dbClient
    .insert(aiResults)
    .values(input)
    .onConflictDoUpdate({
      target: [
        aiResults.userId,
        aiResults.businessId,
        aiResults.type,
        aiResults.inputHash,
      ],
      set: {
        provider: input.provider,
        promptVersion: input.promptVersion,
        output: input.output,
        createdAt: new Date(),
      },
    })
    .returning();

  return result;
}
