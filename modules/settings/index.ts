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
 * `user_settings` read/write (architecture.md §5.2, §7.2, §11.1, §13.4).
 * The Google/AI keys are encrypted with `lib/crypto` before they ever
 * reach the database and are never decrypted for display — only a
 * masked "is a key present" boolean is returned to callers. Decryption
 * exists here solely for future server-side use (Google/AI API calls in
 * Sprint 2+/5), not for round-tripping to the client.
 */

export type MaskedSettings = {
  hasGoogleApiKey: boolean;
  aiProvider: "openai" | "gemini" | "claude" | null;
  hasAiApiKey: boolean;
  updatedAt: Date | null;
};

function mask(
  row: typeof userSettings.$inferSelect | undefined,
): MaskedSettings {
  if (!row) {
    return {
      hasGoogleApiKey: false,
      aiProvider: null,
      hasAiApiKey: false,
      updatedAt: null,
    };
  }

  return {
    hasGoogleApiKey: true,
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

/** Decrypted, server-only access for a future Google/AI API call. */
export async function getDecryptedKeys(userId: string) {
  const [row] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  if (!row) return null;

  return {
    googleApiKey: decrypt(row.googleApiKeyEnc),
    aiProvider: row.aiProvider,
    aiApiKey: row.aiApiKeyEnc ? decrypt(row.aiApiKeyEnc) : null,
  };
}

export class GoogleApiKeyRequiredError extends Error {
  constructor() {
    super("A Google API key is required to save settings for the first time.");
    this.name = "GoogleApiKeyRequiredError";
  }
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

  if (!existing && input.googleApiKey === "") {
    throw new GoogleApiKeyRequiredError();
  }

  const nextAiProvider = input.aiProvider === "" ? null : input.aiProvider;
  const providerChanged = existing?.aiProvider !== nextAiProvider;
  const changedFields: string[] = [];

  const googleApiKeyEnc =
    input.googleApiKey !== ""
      ? encrypt(input.googleApiKey)
      : existing!.googleApiKeyEnc;
  if (input.googleApiKey !== "") changedFields.push("google_api_key");

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
      googleApiKeyEnc,
      aiProvider: nextAiProvider,
      aiApiKeyEnc,
    })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: {
        googleApiKeyEnc,
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
