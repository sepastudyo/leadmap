import "server-only";
import { and, eq } from "drizzle-orm";

import { users } from "@/db/schema";
import { db, notDeleted } from "@/lib/db";
import { EmailAlreadyExistsError } from "@/modules/shared";

/**
 * User lookups/creation against `users` (architecture.md §5.2). No
 * Auth.js adapter is used — sessions are JWT-only and there are no
 * `accounts`/`sessions`/`verificationTokens` tables, so Credentials and
 * OAuth sign-in both resolve identity through these two functions
 * directly (architecture.md §4 "modules/auth — session, account,
 * RBAC-ready policies").
 *
 * Soft-deleted users are excluded via `lib/db`'s central `notDeleted()`
 * helper (architecture.md §5.5 "filtered centrally in lib/db") — the
 * same helper Sprint 4's `favorites`/`notes` repositories use.
 */

export type NewUser = {
  email: string;
  name: string;
  passwordHash: string | null;
  authProvider: string;
};

export async function findUserByEmail(email: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email), notDeleted(users.deletedAt)))
    .limit(1);

  return user;
}

function isUniqueViolation(error: unknown): boolean {
  // Drizzle wraps the driver's error in a `DrizzleQueryError`, with the
  // original `postgres` package error (which carries the Postgres error
  // code) nested under `.cause`, not on the thrown error itself.
  const cause =
    typeof error === "object" && error !== null && "cause" in error
      ? (error as { cause?: unknown }).cause
      : undefined;

  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    (cause as { code?: unknown }).code === "23505"
  );
}

export async function createUser(input: NewUser) {
  try {
    const [user] = await db.insert(users).values(input).returning();
    return user;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new EmailAlreadyExistsError();
    }
    throw error;
  }
}
