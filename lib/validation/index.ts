/**
 * Zod schemas shared by Route Handlers and forms — validation at every
 * boundary (architecture.md §13.3). Schemas are added as each API/form
 * is built. See `config/env.ts` for server environment validation,
 * which is separate from this module.
 */
export * from "./auth";
export * from "./settings";
