import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit is a standalone CLI, not part of the Next.js app, so it
 * can't go through `config/env.ts` (guarded with `server-only`, which
 * assumes Next.js's bundler). It loads `.env.local` directly instead —
 * the same file the app itself reads in development.
 */
loadEnv({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set (expected in .env.local)");
}

export default defineConfig({
  schema: "./db/schema/index.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
