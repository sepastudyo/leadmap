import { customType } from "drizzle-orm/pg-core";

/**
 * Case-insensitive text. Used for `users.email` — architecture.md §5.2
 * specifies `email (citext unique)`. Requires the `citext` Postgres
 * extension, enabled by the first migration.
 */
export const citext = customType<{ data: string }>({
  dataType() {
    return "citext";
  },
});

/**
 * Raw binary storage for AES-256-GCM ciphertext. Used for
 * `user_settings.google_api_key_enc` / `ai_api_key_enc` — architecture.md
 * §5.2 specifies both as `bytea, encrypted`.
 */
export const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});
