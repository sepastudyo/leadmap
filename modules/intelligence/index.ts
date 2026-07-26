/**
 * Business Intelligence domain logic (architecture.md §3, module #4).
 * Place Details enrichment (Sprint 3 Phase 3.1) and the Website
 * Analysis pipeline's acquisition foundation (Sprint 3 Phase 3.2) are
 * implemented; the rest of the analysis pipeline (Cheerio parsing,
 * metadata/SEO/CMS/tracking/social/schema/SSL) and the Lead Score
 * engine (`./scoring`) remain stubs, scoped for later Sprint 3 phases.
 */
export * from "./analysis";
export * from "./place-details";
