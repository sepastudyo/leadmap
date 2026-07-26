import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/config/env";
import * as schema from "@/db/schema";

/**
 * `prepare: false` disables postgres.js prepared statements, which are
 * incompatible with transaction-mode connection poolers (Neon/Supabase
 * pgbouncer) — the pooler is mandatory for serverless connection
 * fan-out (architecture.md §15).
 */
const client = postgres(env.DATABASE_URL, { prepare: false });

export const db = drizzle(client, { schema });
