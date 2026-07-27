# LeadMap v1.0.0 — Release Notes

**Status:** Final release. This is the last planned sprint and the last planned release under this engagement.
**Source of truth:** [architecture.md](./architecture.md); every `docs/sprint-N.md` / `docs/sprint-N-completion.md` pair from Sprint 1 through Sprint 8.

---

## What LeadMap is

An AI-powered lead intelligence platform for digital marketing agencies: discover real businesses via Google Places, analyze their digital presence, compute an explainable Lead Score, organize the results as a lightweight personal lead list, and — optionally, with a user-supplied API key — get an AI-generated audit and opportunity assessment. It is deliberately not an outreach or automation platform: every action is user-triggered, and no code path generates outreach content of any kind (architecture.md §1.2).

## What shipped, by module

- **Authentication** — email/password and OAuth (Google/GitHub) via Auth.js; rate-limited sign-in/sign-up; encrypted session cookies.
- **Dashboard** — saved-leads count, follow-ups due today, and per-user recent-search history (Sprint 7), all pull-based reads with no notification engine or scheduler.
- **Business Discovery** — staged Country→City→District→Category→Keyword search against Google Places, cache-first (`search_cache`, deduplicated by Place ID); Table View and Map View sharing one filtered dataset; five filters — category, rating, has-website, lead-score range (Sprint 7), and a Recent Search click-through that prefills and auto-runs the same query (Sprint 7 Phase 7.7).
- **Business Intelligence** — Place Details enrichment, an HTTP-only Website Analysis pipeline (SEO, CMS/technology, tracking, social presence, schema/OG, robots.txt/sitemap.xml, SSL), an explainable, versioned Lead Score engine, and manual force-refresh for both Place Details and Website Analysis (Sprint 7 Phase 7.6), rate-limited independently of the automatic TTL-based refresh.
- **Lead Organization** — favorite/unfavorite, status, priority, follow-up date, notes (add/pin/edit), and streamed CSV/XLSX export of a selected set.
- **AI (optional, bring-your-own-key)** — AI Audit and Opportunity Reasoning against OpenAI, Gemini, or Claude, structured-output validated, cached by input hash so identical inputs are never re-billed. The app is fully functional with no key configured.
- **Settings** — Google Maps and AI provider keys, encrypted at rest (AES-256-GCM), validated live on save, never redisplayed after entry.

## Security posture (Sprint 6)

Postgres-backed rate limiting on search, AI, and force-refresh actions; Zod validation at every request boundary including path parameters; a Content-Security-Policy plus standard security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`); an SSRF guard on the website analyzer (default-deny IP-range allowlisting, DNS-rebinding-resistant); and a `npm audit`-driven dependency review that traced every reported vulnerability to its actual exploit precondition rather than trusting severity labels alone.

## Production readiness (Sprint 8)

A polish and final-verification pass, not a redesign: consistent loading-state feedback across every interactive panel, distinct empty states for "nothing here yet" vs. "nothing matches your filter," a documentation-accuracy fix to `README.md` (which had drifted badly — it still described the project as Sprint-1-only), and re-verification (not re-assumption) that Sprint 6's security headers actually apply to every route Sprint 7 added, that no new dependency vulnerabilities were introduced, and that environment-variable validation has no gaps.

## Known, permanent limitations of this release

Disclosed explicitly, not silently dropped — none of these block continued use of the app, and none will be revisited under this engagement, since this is the final release:

- **No live testing anywhere in this project's history.** Every one of the eight sprints was built, typechecked, and build-verified in a sandbox with no live Postgres instance, no real Google/AI API key, and no real browser. Nothing in LeadMap has been clicked in an actual browser or run against a real production database by this engagement. This is the single most important caveat on this release.
- **Distance filter** (architecture.md §8's fifth named Discovery filter) was never built — it needs a location-reference-point UI this app doesn't have.
- **Discovery's table doesn't display the `websiteUrl`/`leadScore` values** a user can filter by (Sprint 7 Phase 7.5) — filterable, not visible in a column.
- **The Business Detail "Refresh" action** shows only the first failure's message if both the Place Details and Website Analysis force-refresh calls fail in the same click, not both.
- **A CI-workflow encryption-key literal** (`docs/project-health-review.md` finding #9) remains — CI-only, throwaway database, not exploitable against production data, but an attractive nuisance for a future contributor to copy elsewhere.
- **Six items in `docs/product-hardening-backlog.md`** remain fully open: a performance pass against real query volume, full observability confirmation (Vercel Analytics/uptime monitor actually configured), a backup/restore drill, ADRs and runbooks, the commercial/legal checklist (Vercel Pro migration, Google Maps ToS review, legal/privacy review), and test infrastructure (no Vitest/Playwright exists in this project). Each has a documented reason, priority, effort estimate, and blocking status in that file.

## What this means for whoever picks this up next

This release is code-complete and internally consistent with its own architecture document, but it has never been operated. Before any real commercial use: run the backup/restore drill against a real database, complete the commercial/legal checklist, and — ideally — stand up the test infrastructure this project never had. `docs/product-hardening-backlog.md` is the map for all of that; it was written for exactly this handoff.

---

## Sprint-by-sprint summary

| Sprint | Theme                                                                  | Completion report             |
| ------ | ---------------------------------------------------------------------- | ----------------------------- |
| 1      | Foundation — auth, encrypted key storage, dashboard shell, CI/CD       | `docs/sprint-1.md`            |
| 2      | Business Discovery — Google Places search, cache-first, table/map      | `docs/sprint-2.md`            |
| 3      | Business Intelligence — Website Analysis, Lead Score                   | `docs/sprint-3.md`            |
| 4      | Lead Organization — favorites, notes, follow-ups, export               | `docs/sprint-4.md`            |
| 5      | AI Intelligence — provider adapters, AI Audit, Opportunity Reasoning   | `docs/sprint-5-completion.md` |
| 6      | Security hardening — rate limits, validation, CSP, dependency audit    | `docs/sprint-6-completion.md` |
| 7      | Product completion — Recent Searches, Discovery filters, force-refresh | `docs/sprint-7-completion.md` |
| 8      | v1.0 release — UI/UX polish, final QA, production readiness            | `docs/sprint-8-completion.md` |

---

## Final conclusion

**LeadMap v1.0.0 is released.** All eight sprints are complete. This is the final planned release — there is no Sprint 9, no further planned features, and no additional backlog beyond what `docs/product-hardening-backlog.md` already records. The project, as scoped, ends here.
