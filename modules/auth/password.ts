import "server-only";
import bcrypt from "bcryptjs";

/**
 * Password hashing "via the auth layer" (architecture.md §13.1:
 * "Passwords (when used) hashed with a strong algorithm (bcrypt/argon2
 * via the auth layer)"). bcryptjs is a pure-JS bcrypt implementation —
 * chosen over the native `bcrypt` package to avoid native-binary
 * compilation in Vercel's serverless build environment.
 */
const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
