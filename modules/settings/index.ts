import "server-only";
import { eq } from "drizzle-orm";

import { auditLogs, userSettings } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import type { UpdateSettingsInput } from "@/lib/validation";
// Direct file import, not the `@/modules/ai` barrel — see
// `modules/ai/validate-key.ts`'s own comment: that barrel re-exports
// `audit.ts`/`opportunity.ts`, which import `getDecryptedKeys` from
// this file, so importing the barrel here would be circular.
import { validateAiProviderKey } from "@/modules/ai/validate-key";

/**
 * `user_settings` read/write (architecture.md §5.2, §11.1, §13.4). The
 * AI key is encrypted with `lib/crypto` before it ever reaches the
 * database and is never decrypted for display — only a masked "is a
 * key present" boolean is returned to callers. Decryption exists here
 * solely for future server-side use (AI API calls, Sprint 5), not for
 * round-tripping to the client.
 *
 * No Google key lives here anymore — Business Discovery migrated off
 * Google Maps Platform onto free, keyless OpenStreetMap-backed services
 * (`modules/geo`); this module now manages only the still-optional,
 * still-BYOK AI provider key.
 */

export type MaskedSettings = {
  aiProvider: "openai" | "gemini" | "claude" | null;
  hasAiApiKey: boolean;
  updatedAt: Date | null;
};

function mask(
  row: typeof userSettings.$inferSelect | undefined,
): MaskedSettings {
  if (!row) {
    return {
      aiProvider: null,
      hasAiApiKey: false,
      updatedAt: null,
    };
  }

  return {
    aiProvider: row.aiProvider,
    hasAiApiKey: row.aiApiKeyEnc !== null,
    updatedAt: row.updatedAt,
  };
}

export async function getMaskedSettings(
  userId: string,
): Promise<MaskedSettings> {
  const [row] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  return mask(row);
}

/** Decrypted, server-only access for an AI API call. */
export async function getDecryptedKeys(userId: string) {
  const [row] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  if (!row) return null;

  return {
    aiProvider: row.aiProvider,
    aiApiKey: row.aiApiKeyEnc ? decrypt(row.aiApiKeyEnc) : null,
  };
}

export class AiApiKeyRequiredError extends Error {
  constructor() {
    super("Enter an AI API key for the newly selected provider.");
    this.name = "AiApiKeyRequiredError";
  }
}

/**
 * architecture.md §3 Settings: "Keys are validated on save". Message
 * is deliberately generic — same "never expose a provider-specific
 * error" discipline architecture.md §11 requires for AI Audit/
 * Opportunity Reasoning, extended here since the underlying check is
 * the same `generateStructured` call and could otherwise leak
 * provider-specific error detail.
 */
export class AiApiKeyInvalidError extends Error {
  constructor() {
    super(
      "That AI API key couldn't be validated — check the key and provider, then try again.",
    );
    this.name = "AiApiKeyInvalidError";
  }
}

export async function saveSettings(
  userId: string,
  input: UpdateSettingsInput,
  context: { ip: string },
): Promise<MaskedSettings> {
  const [existing] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  const nextAiProvider = input.aiProvider === "" ? null : input.aiProvider;
  const providerChanged = existing?.aiProvider !== nextAiProvider;
  const changedFields: string[] = [];

  // A cleared provider always clears its key; a provider change requires
  // a fresh key (a key is provider-specific and can't be carried over).
  let aiApiKeyEnc: Buffer | null;
  if (nextAiProvider === null) {
    aiApiKeyEnc = null;
    if (existing?.aiApiKeyEnc) changedFields.push("ai_api_key");
  } else if (input.aiApiKey !== "") {
    const validation = await validateAiProviderKey(
      nextAiProvider,
      input.aiApiKey,
    );
    if (!validation.ok) throw new AiApiKeyInvalidError();

    aiApiKeyEnc = encrypt(input.aiApiKey);
    changedFields.push("ai_api_key");
  } else if (providerChanged) {
    throw new AiApiKeyRequiredError();
  } else {
    aiApiKeyEnc = existing?.aiApiKeyEnc ?? null;
  }
  if (providerChanged) changedFields.push("ai_provider");

  const [row] = await db
    .insert(userSettings)
    .values({
      userId,
      aiProvider: nextAiProvider,
      aiApiKeyEnc,
    })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: {
        aiProvider: nextAiProvider,
        aiApiKeyEnc,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (changedFields.length > 0) {
    await db.insert(auditLogs).values({
      userId,
      action: "user_settings.updated",
      entityType: "user_settings",
      entityId: userId,
      metadata: { changedFields },
      ip: context.ip,
    });
  }

  return mask(row);
}
