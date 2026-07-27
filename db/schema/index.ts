/**
 * Single source of schema truth (architecture.md §4, §5). Tables are
 * added incrementally, sprint by sprint. Currently defined: the Sprint 1
 * user-plane baseline (`users`, `user_settings`, `rate_limits`,
 * `audit_logs`), the Sprint 2 shared cache plane baseline (`businesses`,
 * `search_cache`), `idempotency_keys` (architecture.md §12.4 —
 * added outside the original §5.2 dictionary; see the comment in
 * `idempotency-keys.ts` for why), the Sprint 3 Phase 3.5 Lead Score
 * engine tables (`scoring_rules`, `scoring_rulesets`, `lead_scores`),
 * the Sprint 3 finalization's Website Analyzer persistence tables
 * (`website_analyses`, `analysis_history`), the Sprint 4 Phase 4.1
 * user-plane Lead Organization tables (`favorites`, `notes`), and the
 * Sprint 5 Phase 5.1 AI result cache (`ai_results`).
 */
export * from "./columns";
export * from "./users";
export * from "./user-settings";
export * from "./rate-limits";
export * from "./audit-logs";
export * from "./businesses";
export * from "./search-cache";
export * from "./idempotency-keys";
export * from "./scoring-rules";
export * from "./scoring-rulesets";
export * from "./lead-scores";
export * from "./website-analyses";
export * from "./analysis-history";
export * from "./favorites";
export * from "./notes";
export * from "./ai-results";
