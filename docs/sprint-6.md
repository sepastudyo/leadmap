# Sprint 6 — Production Release

Source of truth: [architecture.md](./architecture.md) §17.

## Objectives

- Complete a security hardening pass across the whole application (§13, §18).
- Complete a performance pass validating indexes, virtualization, lazy loading, and RSC caching (§14).
- Finalize observability, structured logging, and backup/restore procedures (§15).
- Finalize CI/CD gates and produce documentation/ADRs.
- Complete the commercial-plan checklist (Vercel Hobby → Pro transition, §18).

## Deliverables

- Security hardening: rate-limit coverage review, validation coverage review, secrets audit, CSP, OWASP Top 10 checklist (§13.5), SSRF review (P0).
- Performance pass: `EXPLAIN`-verified indexes (§5.4), virtualization coverage, lazy-loaded client bundles, RSC caching review.
- Observability: structured logging with `request_id` correlation, Sentry coverage review, Vercel Analytics + uptime monitor confirmed.
- Backup/restore drill executed and documented (RPO/RTO documented per §15).
- CI/CD gates finalized (lint, typecheck, unit/integration/e2e, gated migrations).
- Documentation: ADRs for non-trivial decisions, runbooks in `docs/`.
- Commercial-plan checklist: Vercel Pro migration plan, Google Maps Platform ToS compliance review, legal/privacy review (§18, §20).

**Working app milestone:** a hardened, monitored, documented production release.

## Progress

- [ ] Not started.
