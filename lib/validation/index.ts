/**
 * Zod schemas shared by Route Handlers and forms — validation at every
 * boundary (architecture.md §13.3). Schemas are added as each API/form
 * is built. See `config/env.ts` for server environment validation,
 * which is separate from this module.
 */
export * from "./ai";
export * from "./analysis";
export * from "./auth";
export * from "./crm";
export * from "./discovery";
export * from "./idempotency";
export * from "./scoring";
export * from "./settings";
