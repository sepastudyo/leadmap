# Product Hardening Backlog

**Status:** Open backlog, created at the close of the Sprint 6 Security milestone.
**Source of truth for these items:** [sprint-6.md](./sprint-6.md)'s original deliverables list; [architecture.md](./architecture.md) as cited per item.

---

## Why this document exists

Sprint 6 ("Production Release") named seven deliverables. The Security milestone — rate-limit coverage, request-validation consistency, secrets/error-handling correctness, and CSP/security headers — is complete (see [sprint-6-completion.md](./sprint-6-completion.md)). The remaining six deliverable areas are real, legitimate work, but **none of them are bugs, security vulnerabilities, or blockers to continuing product development in Sprint 7**. They are moved here, explicitly, rather than left as an implicit gap in a sprint marked "complete."

---

## Performance optimization

**Remaining task:** Validate the index set in architecture.md §5.4 with `EXPLAIN` against real query patterns; audit virtualization coverage (TanStack Virtual) across the results table and lead lists; confirm lazy-loading/code-splitting boundaries (Map view, charts, export dialog) are actually deferred in the shipped bundle; review RSC data-caching behavior on the Dashboard, Business Detail, and Discovery pages.

- **Reason deferred:** Requires either a populated database with realistic row counts (to get meaningful `EXPLAIN` output) or production traffic patterns to know which queries are actually hot — neither exists in this sandbox. Sprint 6's phases were explicitly scoped to security only.
- **Priority:** Medium
- **Estimated effort:** Medium (1–3 days) — mostly verification and tuning, not new engineering; a few items (e.g., confirming `next/dynamic({ ssr: false })` boundaries) are quick, `EXPLAIN`-driven index tuning is the slower part.
- **Blocking:** Non-blocking. The application is functionally correct without this; it affects efficiency at scale, not correctness.
- **Recommended future sprint:** Sprint 7, once real usage data exists to prioritize which queries/bundles actually matter.

---

## Observability improvements

**Remaining task:** Audit structured logging for consistent `request_id` correlation across all Route Handlers; review Sentry coverage (confirm every meaningful catch/throw path reports, none double-report, none report expected conditions like timeouts as bugs); confirm Vercel Analytics and an uptime monitor (e.g., Betterstack) are actually configured on the deployed project, not just documented as a plan.

- **Reason deferred:** Sentry itself is already wired in (`instrumentation.ts`, `instrumentation-client.ts`, `lib/observability`, since Sprint 1/4) and used at several call sites — this item is a _coverage review_ of what already exists, not new instrumentation, but it wasn't in scope for the security-only phases. Confirming Vercel Analytics/uptime configuration requires access to the live Vercel project dashboard, which isn't available in this sandbox.
- **Priority:** Medium
- **Estimated effort:** Small–Medium (few hours to 1–2 days) — mostly a review pass over existing `captureException` call sites plus a dashboard-configuration check.
- **Blocking:** Non-blocking. Errors are already reported where they've been wired in; this is about confirming completeness, not building the capability from scratch.
- **Recommended future sprint:** Sprint 7, ideally paired with real deployment access.

---

## Backup / restore drill

**Remaining task:** Execute an actual restore drill against the production Postgres provider (Neon or Supabase), and document RPO/RTO per architecture.md §15.

- **Reason deferred:** Requires a live, real production database — categorically unavailable in this sandbox (every prior sprint's completion report has noted the same "no live Postgres" limitation). This cannot be simulated or approximated; it requires real infrastructure access and, ideally, a scheduled maintenance window.
- **Priority:** High (data-loss risk is a serious category), but explicitly non-blocking for continued feature work.
- **Estimated effort:** Small (half a day to a day) once infrastructure access exists — the provider (Neon/Supabase) handles the mechanics (PITR); the work is executing the drill and writing down the observed RPO/RTO.
- **Blocking:** Non-blocking for Sprint 7 development. Blocking for a real commercial launch — should happen before the app holds real customer data at scale.
- **Recommended future sprint:** Sprint 7 or whenever production infrastructure (a real Neon/Supabase project) is provisioned — whichever comes first.

---

## ADRs and runbooks

**Remaining task:** Write ADRs for the non-trivial architectural decisions already made across Sprints 1–6 (e.g., Drizzle over Prisma, Postgres-backed rate limiting over Redis, exceljs over SheetJS, the CSP no-nonce vs nonce tradeoff from Phase 6.5, drizzle-kit CLI bypass in CI); write operational runbooks in `docs/` (e.g., "how to rotate the encryption master key," "how to respond to a rate-limit exhaustion report," "how to investigate a failed migration in CI").

- **Reason deferred:** Pure documentation work with no code or security implication; explicitly out of scope for the security-only phases. The rationale for most of these decisions already exists as inline code comments (this codebase's established convention), so this is about _consolidating_ that reasoning into standalone, discoverable documents — not recovering lost context.
- **Priority:** Low
- **Estimated effort:** Medium (1–2 days) — mostly writing, since the underlying decisions and their reasoning are already documented inline.
- **Blocking:** Non-blocking.
- **Recommended future sprint:** Sprint 7 or later, whenever there's a lull between feature phases — good "cool-down" work.

---

## Commercial / legal checklist

**Remaining task:** Produce a Vercel Hobby → Pro migration plan (architecture.md §18's flagged commercial-use requirement); complete a Google Maps Platform Terms of Service compliance review (architecture.md §7's mandatory pre-launch review); complete a legal/privacy review (data minimization, regional considerations, GDPR posture for cached business/owner data).

- **Reason deferred:** These are business and legal decisions, not engineering tasks — architecture.md itself frames all three as requiring review "before launch," not before continued development. None of the three can be meaningfully completed by an engineering pass; they need a human decision-maker (on Vercel plan/budget) and, for the ToS/legal items, ideally actual legal counsel.
- **Priority:** High (all three are explicitly named as launch-blocking in architecture.md §7 and §18), but non-blocking for Sprint 7's engineering work.
- **Estimated effort:** Large (multi-day, spread across non-engineering stakeholders) — mostly waiting on decisions/reviews outside engineering's control, not implementation effort.
- **Blocking:** Non-blocking for further development. **Blocking for commercial launch** — this is the one category where "non-blocking" doesn't mean "skippable," just "not gating Sprint 7."
- **Recommended future sprint:** Not sprint-bound — should be resolved whenever a real commercial launch date is set, ideally with enough lead time for legal review.

---

## Any remaining non-security documentation

**OWASP Top 10 checklist document.** Sprint 6's deliverables list names this as its own artifact (architecture.md §13.5). The underlying controls it would document are already implemented and verified across Phases 6.1–6.5 (injection via validation fixes, XSS via CSP, broken access control via repeated ownership-scoping checks, SSRF reverified sound in the Sprint 6 final review) — what's missing is the written checklist itself cross-referencing each of the ten categories against this app's actual controls.

- **Reason deferred:** A documentation artifact, not a control gap — the controls it would list already exist and were verified. Writing it wasn't in scope for any single security phase, each of which was scoped to fixing one concrete issue.
- **Priority:** Low
- **Estimated effort:** Small (a few hours) — compiling already-verified facts into one document.
- **Blocking:** Non-blocking.
- **Recommended future sprint:** Sprint 7, as a quick documentation task.

**Test infrastructure (unit/integration/e2e).** No test framework exists in this project at all — no Vitest/Playwright config, no test files, no `test` script in `package.json`, despite architecture.md §19 recommending Vitest + Testing Library + Playwright and sprint-6.md's CI/CD deliverable naming "unit/integration/e2e" explicitly. This predates Sprint 6 (it's been absent since Sprint 1) and wasn't closed by it either.

- **Reason deferred:** Introducing a test framework and initial coverage from zero is substantial new engineering work, not a fix to an existing issue — explicitly out of scope for phases scoped to "fix only the highest-priority security issue."
- **Priority:** Medium
- **Estimated effort:** Large (multi-day) — framework setup, initial test-writing conventions, and meaningful coverage of the existing six sprints' worth of `modules/`/`app/` code is a substantial undertaking, not a quick add.
- **Blocking:** Non-blocking today (the app has been built and manually/build-verified without it), but the risk of regressions grows with every sprint this remains open.
- **Recommended future sprint:** Sprint 7 — ideally early, before Sprint 7 adds enough new surface area that retrofitting tests becomes even more expensive.

---

## Summary table

| Item                                       | Priority | Effort                    | Blocking?               | Recommended sprint             |
| ------------------------------------------ | -------- | ------------------------- | ----------------------- | ------------------------------ |
| Performance optimization                   | Medium   | Medium                    | No                      | Sprint 7                       |
| Observability improvements                 | Medium   | Small–Medium              | No                      | Sprint 7                       |
| Backup / restore drill                     | High     | Small (once infra exists) | No (dev) / Yes (launch) | Sprint 7 or infra provisioning |
| ADRs and runbooks                          | Low      | Medium                    | No                      | Sprint 7+                      |
| Commercial / legal checklist               | High     | Large                     | No (dev) / Yes (launch) | Not sprint-bound               |
| OWASP Top 10 checklist doc                 | Low      | Small                     | No                      | Sprint 7                       |
| Test infrastructure (unit/integration/e2e) | Medium   | Large                     | No                      | Sprint 7 (early)               |

---

_This backlog is additive to, not a replacement for, `docs/project-health-review.md`, which continues to track its own separate, already-numbered findings (e.g., #9's CI-workflow encryption-key literal) independently of this document._
