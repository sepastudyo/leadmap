# Sprint 3 — Business Intelligence

Source of truth: [architecture.md](./architecture.md) §17.

## Objectives

- Implement Place Details enrichment with ToS-compliant caching TTLs.
- Build the Website Analysis pipeline (HTTP-only, staged, SSRF-guarded) per §9.
- Build the modular, data-driven Lead Score engine and seed scoring ruleset per §10.
- Build the business detail page presenting analysis, explainable score, and Google Business signals.

## Deliverables

- Place Details enrichment (cached in `businesses.place_summary`, ~30-day TTL).
- Website Analysis pipeline: acquire (SSRF-guarded fetch) → parse (Cheerio) → metadata/SEO/CMS/tracking/social/schema-OG stages → robots.txt/sitemap.xml → SSL → assemble/validate → persist to `website_analyses`.
- SSRF guards: private/link-local/metadata IP blocking, redirect cap, size cap, timeout.
- Lead Score engine: `scoring_rules` + `scoring_rulesets` tables, sandboxed expression evaluator, explainable `breakdown`, versioned scoring via `lead_scores`.
- Seed scoring ruleset (initial published version).
- Business detail page: analysis results, explainable Lead Score, Google Business signals (rating, review count, category, presence).

**Working app milestone:** open a business, run analysis, get an explainable Lead Score.

## Progress

Sprint 3 is being built in phases, same pattern as Sprint 2 (see
docs/sprint-2.md) — each phase's scope tracked here rather than jumping
straight to the sprint-level deliverables.

### Phase 3.1 — Place Details client, repository, enrichment, TTL/refresh

- [x] Google Place Details API integration + client
      (`modules/google/place-details.ts`) — same API family and
      conventions as Sprint 2's `places-search.ts` (Places API (New),
      `X-Goog-Api-Key` + `X-Goog-FieldMask` headers, for the same §7.3
      field-mask reason). Field mask requests exactly what architecture.md
      §7.1 names for this API — phone, website, hours, category — plus
      `id`/`displayName` for identity; nothing else (no ratings/photos/
      reviews, which are Places Search's job and already cached).
- [x] Place Details repository: extended
      `modules/discovery/businesses-repository.ts` (Sprint 2's existing
      repository, per instruction — "Reuse the existing repository
      pattern established in Sprint 2") with `getBusinessById` (lookup
      by internal `id`, distinct from the batch-by-`google_place_id`
      lookup discovery already had) and `updatePlaceDetailsForBusiness`.
      The two write paths stay strictly partitioned: `upsertBusinesses`
      (Sprint 2) never touches `phone`/`website_url`/`place_summary`/
      `details_fetched_at`/`details_expires_at`; `updatePlaceDetailsForBusiness`
      (Sprint 3) never touches the discovery columns (`name`, `address`,
      `country`/`city`/`district`, `location`, `google_rating`,
      `google_review_count`) — each sprint's write path is scoped to the
      columns it owns, so neither can clobber the other's data on the
      same row. This is what preserves Sprint 2 backward compatibility:
      nothing about how discovery upserts businesses changed.
- [x] Businesses enrichment + TTL/refresh logic:
      `modules/intelligence/place-details.ts` (`getOrRefreshPlaceDetails`)
      — a lazy read-through matching architecture.md §6.2 exactly: a
      fresh row (`details_expires_at` in the future) serves from
      Postgres with no Google call; a stale/missing one calls Google
      within the same request, persists via the repository, and returns
      the updated row. TTL is 30 days (`PLACE_DETAILS_TTL_DAYS`,
      `config/constants.ts`), matching §6.1's "~30 days (ToS-bounded)."
      `place_summary` currently holds `{ hours: string[] | null }` — the
      one Place Details field §7.1 names that has no dedicated column.
- [x] Database updates: **none required.** `businesses.phone` /
      `website_url` / `place_summary` / `details_fetched_at` /
      `details_expires_at` were already part of the table's full §5.2
      column set from Sprint 2 Phase 2.1 (built ahead of need
      specifically so Sprint 3 wouldn't require a migration — see that
      phase's notes in docs/sprint-2.md). Confirmed no schema drift:
      `db/schema/` and `db/migrations/` are untouched by this phase.
- [x] Cache integration with the existing discovery flow: the
      enrichment functions read and write the _same_ `businesses` rows
      Sprint 2's search flow creates (matched by the same `id`/
      `google_place_id`), through the same repository module, using the
      same `DbClient`-optional pattern (`modules/discovery/businesses-repository.ts`
      already had this from the Idempotency-Key phase's threading work).
      What this phase deliberately does **not** do is call Place Details
      automatically during a search: architecture.md §3 frames
      enrichment as happening "on opening a business" (a per-business,
      on-demand action), and §7.3 ties Google spend to "genuinely new
      searches" — auto-enriching all `SEARCH_PAGE_SIZE_MAX` (20) results
      per search would multiply Google Places calls 20x per search and
      contradict both. `getOrRefreshPlaceDetails` is exported and ready
      to be called from a business detail page or Route Handler in a
      later Sprint 3 phase — nothing currently calls it yet, matching
      how Phase 2.1 built `modules/discovery/search.ts`'s orchestration
      before any Route Handler existed to call it.

**Deliberately not in Phase 3.1** (later Sprint 3 phases, per
instruction): Website Analyzer, AI, Lead Scoring, Business Detail Page,
any CRM feature (favorites/notes — Sprint 4 regardless). No new Route
Handler either — matching the Sprint 2 precedent of separating
orchestration (Phase 2.1) from its HTTP surface (Phase 2.2), the same
split applies here.

**Verification:** `npm run format`, `npm run lint`, `npx tsc --noEmit`,
and `npm run build` all pass (the one pre-existing benign React
Compiler / TanStack Table warning, unrelated to this phase). No live
Postgres or Google API key is available in this sandbox (same
limitation noted throughout Sprint 2), so `getOrRefreshPlaceDetails`'s
actual behavior against a real database and a real Place ID is
unverified beyond typecheck + code review — worth a manual pass once a
caller exists to exercise it end-to-end.

### Phase 3.2 — Website Analyzer foundation: HTTP fetch pipeline, SSRF protection

All of this lives in `modules/intelligence/analysis/`, the subfolder
architecture.md §4 already names for exactly this ("analysis/ — website
analysis pipeline + stages"). No database changes, no Route Handler —
same "foundation first, HTTP surface later" split as Phase 2.1/3.1.

- [x] Website Analyzer foundation: `modules/intelligence/analysis/index.ts`
      exports `acquireWebsite(url)` — architecture.md §9.1's [1 Acquire]
      stage. Fetches the page and robots.txt concurrently (independent
      of each other), then discovers/fetches the sitemap (depends on
      robots.txt's declared URLs) — reduces total latency against the
      serverless time budget (§18) without changing any stage's
      guarantees. The page fetch failing propagates (nothing to analyze
      without it); robots.txt/sitemap failures don't (§9.3 "a failing
      stage yields status = partial") — they're optional signals, not
      the page under analysis.
- [x] HTTP fetch pipeline: `guarded-fetch.ts` (`guardedFetch`) — the
      shared SSRF/timeout/redirect/size-guarded GET every acquisition
      target goes through. Redirects are followed **manually** (a loop,
      `redirect: "manual"`), not via `fetch`'s built-in follower —
      that's what makes both "redirect limits" and re-validating SSRF
      safety on every hop possible; the built-in follower supports
      neither.
- [x] robots.txt retrieval: `robots.ts` (`fetchRobotsTxt`) — fetches
      `/robots.txt` and extracts `Sitemap:` directive URLs for discovery.
      Full directive evaluation (User-agent/Disallow/Allow matching,
      §9.2's fuller "directives" scope) is a later phase — this phase is
      retrieval only, as scoped.
- [x] Sitemap discovery: `sitemap.ts` (`discoverSitemap`) — tries
      robots.txt-declared sitemap URL(s) first, falls back to the
      conventional `/sitemap.xml`. Parsing the sitemap's URL list /
      staleness (§9.2) is a later phase; this phase discovers and
      retrieves it, as scoped.
- [x] HTML download: `page.ts` (`fetchPage`) — a thin wrapper over
      `guardedFetch` for the target page itself.
- [x] Response normalization: every fetch (page, robots.txt, sitemap)
      returns the same `FetchedResource` shape (`requestedUrl`,
      `finalUrl`, `status`, `ok`, `headers`, `body`, `bytesRead`,
      `redirectCount`, `elapsedMs`) regardless of which of the three it
      came from — later stages (Cheerio parsing, metadata/SEO/etc.,
      still not implemented) consume one consistent type rather than
      three ad hoc ones.
- [x] SSRF protection: `ssrf-guard.ts` — architecture.md §13.5's P0
      control. Default-deny via `ipaddr.js`'s address classification
      (only `"unicast"` is allowed; every other category — private,
      loopback, linkLocal (which is what actually catches
      `169.254.169.254`, the cloud-metadata endpoint), uniqueLocal,
      carrierGradeNat, reserved, multicast, ...) is blocked, including
      IPv4 addresses smuggled inside IPv4-mapped IPv6 literals
      (`::ffff:169.254.169.254`). Wired in as a custom `lookup` function
      passed to an `undici` `Agent` via `connect: { lookup }` — not a
      "resolve once, then fetch normally" pre-check, which would leave
      a DNS-rebinding gap open across `guardedFetch`'s redirect hops.
      Building this required `undici` and `ipaddr.js` as new explicit
      dependencies (`undici` was already present transitively — it's
      what Node's own global `fetch` is built on — but a P0 control is
      exactly the place to depend on it directly rather than an
      undeclared transitive resolution; `ipaddr.js` because hand-rolling
      IPv6 CIDR/range matching is exactly the kind of code prone to the
      subtle bugs that defeat a security control).
- [x] Timeout handling: `AbortSignal.timeout(ANALYZER_TIMEOUT_MS)` per
      request (8s default, `config/constants.ts`), composed with any
      caller-supplied signal via `AbortSignal.any`.
- [x] Redirect limits: `ANALYZER_MAX_REDIRECTS` (5 default) enforced by
      `guardedFetch`'s manual redirect loop, re-validating SSRF safety
      on every hop.
- [x] Content size limits: `ANALYZER_MAX_RESPONSE_BYTES` (2MB default)
      enforced by streaming the response body and aborting once the cap
      is exceeded, rather than buffering an unbounded response first.
- [x] Input validation: `lib/validation/analysis.ts`
      (`analysisTargetUrlSchema`, `z.url({ protocol: /^https?$/ })`) —
      reuses the established `lib/validation/*` pattern (one file per
      domain, re-exported from `lib/validation/index.ts`). This is
      _input_ validation (is the string a well-formed http(s) URL),
      distinct from the SSRF _security control_ (is it safe to actually
      connect to) — a syntactically valid `https://` URL can still
      resolve to a blocked address.

**A real bug caught by live verification, not typecheck:** the first
version of `safeLookup` always called back with the single-address
`(err, address, family)` signature. Node's custom `lookup` contract
actually has **two** shapes depending on the caller-supplied
`options.all` — undici's `Agent` calls with `all: true` (for Happy
Eyeballs / RFC 8305 dual-stack racing), which expects `(err,
addresses[])` instead. Getting this wrong didn't create a security
hole (blocked addresses were still blocked), but it broke **every**
request, safe or not — `guardedFetch("https://example.com")` failed
with `ERR_INVALID_IP_ADDRESS`. Typecheck and lint were both clean
throughout; only running the code against real DNS/network I/O
surfaced it. Fixed by branching on `options.all` and, for the
multi-address case, filtering to public addresses rather than
rejecting the whole resolution if any single record was unsafe — more
correct for genuine dual-stack hosts, and no less safe, since the
non-public records are excluded from the candidate list entirely, not
merely deprioritized.

**Deliberately not in Phase 3.2** (later Sprint 3 phases, per
instruction): SEO analysis, OpenGraph analysis, Schema.org extraction,
CMS detection, tracking detection, SSL analysis, Lead Scoring, Business
Detail Page, AI. No Cheerio/HTML parsing either — every stage that
would consume it ([3]–[8] in §9.1's flow) is excluded, so parsing ahead
of any consumer would be dead code; `FetchedResource.body` is available
as plain text for whichever phase adds it. No browser automation
anywhere in this phase or dependency tree (Playwright/Puppeteer) — HTTP
only, per instruction and per architecture.md §9's own "No headless
browser" framing.

**Verification:** `npm run format`, `npm run lint`, `npx tsc --noEmit`,
and `npm run build` all pass (same one pre-existing benign warning).
Unlike every prior phase, this one **was** exercised against real
network I/O — this sandbox has outbound internet access even without a
database, so a standalone script (mirroring how the EWKB parser was
verified in Sprint 2) ran the actual code, not just a description of
it: `isPublicAddress` against 25 known addresses spanning every
relevant range (public IPv4/IPv6, RFC1918, loopback, the cloud-metadata
endpoint, CGNAT, multicast, reserved, IPv4-mapped IPv6 in both safe and
unsafe forms) — all correct; `guardedFetch` against a real public site
(succeeded), loopback/metadata/private/`localhost` targets (all
correctly blocked), a real HTTP→HTTPS redirect (followed, reported
`redirectCount: 1`), `maxRedirects: 0` against that same redirecting
URL (correctly rejected), and a byte cap far smaller than a real
response (correctly rejected). What's still unverified: behavior
against a genuinely malicious/adversarial server (slowloris-style
trickle responses, a redirect chain that's safe-then-unsafe,
non-UTF-8 encodings) and, as always, the actual database integration —
though this phase doesn't touch the database at all.
