/**
 * Optional, bring-your-own-key AI layer (architecture.md §11): provider
 * adapters (OpenAI, Gemini, Claude) behind a single `generateStructured`
 * interface, the `ai_results` cache repository, AI Audit (Sprint 5
 * Phase 5.2), Opportunity Reasoning (Phase 5.3) — the only two features
 * architecture.md §11.2 allows — and Settings' live key validation
 * (Phase 5.4). `modules/settings/index.ts` imports `validate-key`
 * directly rather than through this barrel — see that file's own
 * comment for why (avoiding a circular module dependency).
 */
export * from "./audit";
export * from "./errors";
export * from "./generate-structured";
export * from "./opportunity";
export * from "./providers";
export * from "./results-repository";
export * from "./types";
export * from "./validate-key";
