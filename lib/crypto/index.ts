import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { env } from "@/config/env";

/**
 * AES-256-GCM envelope encryption for user-provided secrets (Google/AI
 * API keys) using a server-side master key from the environment
 * (architecture.md §13.4). Each call to `encrypt` uses a fresh random
 * IV; the returned envelope is `iv || authTag || ciphertext`, matching
 * the `bytea` shape of `user_settings.google_api_key_enc` /
 * `ai_api_key_enc` (db/schema/user-settings.ts, architecture.md §5.2).
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

const masterKey = Buffer.from(env.ENCRYPTION_MASTER_KEY, "base64");

if (masterKey.length !== KEY_LENGTH) {
  throw new Error(
    `ENCRYPTION_MASTER_KEY must decode (base64) to ${KEY_LENGTH} bytes, got ${masterKey.length}. Generate one with: openssl rand -base64 32`,
  );
}

export function encrypt(plaintext: string): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, masterKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, ciphertext]);
}

export function decrypt(envelope: Buffer): string {
  const iv = envelope.subarray(0, IV_LENGTH);
  const authTag = envelope.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = envelope.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, masterKey, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
