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

### Phase 3.3 — HTML parsing, SEO/Metadata/Schema-OG evaluation

All new files live in `modules/intelligence/analysis/`, extending
Phase 3.2's foundation. No database changes, no Route Handler, no new
fetches — every evaluation stage below is a pure function over
Phase 3.2's already-fetched `acquisition.page` (reused via
`acquireWebsite`, never re-implemented), per instruction ("reuse the
Website Analyzer foundation ... do not duplicate fetch logic").

- [x] HTML parsing: `parse.ts` (`parseHtml`) — [2 Parse] (§9.1 "Parse
      HTML with Cheerio (server-side DOM, no JS execution)"). A thin
      wrapper so Cheerio stays this module's implementation detail
      rather than every stage file's own dependency.
- [x] Metadata — title, meta description, canonical detection, favicon
      detection, language detection: `metadata.ts` (`extractMetadata`)
      — [3 Metadata] (§9.2). `viewport`/`charset`, also part of §9.2's
      Metadata bullet, are **not** extracted — not named in this
      phase's instructions (see the deviation check below). **Closed**
      in the post-Phase 3.3 gap closure — see that section below.
- [x] SEO analysis — title/description quality, heading structure
      (H1–H6), robots meta detection, image alt coverage,
      internal/external link statistics: `seo.ts` (`analyzeSeo`) —
      [4 SEO] (§9.2 "title/description quality, single-H1 check,
      heading hierarchy, canonical correctness, noindex/nofollow,
      indexability verdict"), extended with alt coverage and link
      stats as this phase's instructions name explicitly. Robots-meta
      detection checks **both** `<meta name="robots">` **and** the
      `X-Robots-Tag` response header (already captured by
      `FetchedResource.headers` — no new fetch) — either is a valid
      noindex/nofollow signal per the underlying spec, and only
      checking the meta tag would miss the header-only case. Heading
      hierarchy "sequential" means no level is skipped before it's
      been seen (h1→h3 with no h2 flags; h1→h2→h2→h3 doesn't).
- [x] Open Graph extraction + Twitter Card extraction:
      `social-meta.ts` (`extractOpenGraph`, `extractTwitterCard`) —
      [8 Schema/OG]'s "og:\* coverage" (§9.2), extended to Twitter
      Card's separate meta-tag namespace as this phase's instructions
      name explicitly (Twitter Cards aren't named in §9.2's own bullet
      — see the deviation check below).
- [x] JSON-LD / Schema.org extraction: `structured-data.ts`
      (`extractStructuredData`) — [8 Schema/OG]'s "JSON-LD/microdata
      types present" (§9.2). JSON-LD only; Microdata/RDFa (the other
      two ways Schema.org can be expressed, also named in that same
      §9.2 bullet) are not covered — JSON-LD is the dominant modern
      format and what this phase's instructions name explicitly.
      Malformed JSON-LD blocks (common in the wild) are counted
      (`invalidBlockCount`) rather than silently dropped or crashing
      the whole extraction. **Closed** in the post-Phase 3.3 gap
      closure — see that section below.
- [x] Orchestration: `index.ts` gained `analyzePage(url)` —
      `acquireWebsite` (Phase 3.2, unchanged) → `parseHtml` → every
      evaluation function above, assembled into one `PageAnalysis`.
      Evaluation still runs even when the fetched page came back
      non-2xx (a 404 page has a `<title>` too — reporting that is more
      useful than silently skipping); only a transport-level failure,
      already thrown by `acquireWebsite` itself, prevents a result
      from coming back at all.

**Deliberately not in Phase 3.3** (later Sprint 3 phases, per
instruction): SSL analysis, CMS detection, tracking detection, Lead
Scoring, AI, Business Detail Page. No browser automation anywhere in
this phase or its dependency tree — Cheerio is a server-side HTML
parser with no JS execution, not a browser.

**Verification:** `npm run format`, `npm run lint`, `npx tsc --noEmit`,
and `npm run build` all pass (same one pre-existing benign warning).
Verified against real HTML from two live sites (`example.com`,
`github.com`), not just typecheck — and the real-world data surfaced
genuine, correctly-detected SEO signals rather than only exercising
the happy path: GitHub's homepage actually has four `<h1>` elements
(`hasSingleH1: false`) and a real hierarchy skip
(`hierarchyIsSequential: false`), and its canonical URL
(`https://github.com/`) actually doesn't byte-for-byte match its final
fetched URL (`canonicalMatchesFinalUrl: false`, a trailing-slash
mismatch) — both are true positives, not test artifacts, which is
about as strong a confirmation as this sandbox can offer that the
extraction logic is actually correct and not just non-crashing. Open
Graph, Twitter Card, image alt coverage, and link statistics all
produced plausible, internally-consistent numbers on both sites.
Unverified: behavior on malformed/adversarial HTML (unclosed tags deep
enough to confuse heading-order tracking, extremely large numbers of
elements, non-UTF-8 encodings) and, as always, anything requiring a
live database (still N/A — this phase doesn't touch one either).

**Architecture deviation check for this phase:** three requested items
aren't literally named in architecture.md §9.2's stage-by-stage bullet
summary — image alt coverage, internal/external link statistics
(neither named under "SEO (basic)"), and Twitter Card extraction (§9.2
names OG coverage but not Twitter Cards). None of these contradict an
architecture _decision_; §9.2's bullets read as representative
examples of each stage's output (§9.1's own flow diagram abbreviates
the same stages even further), not an exhaustive, closed field list,
and all three fit squarely inside the SEO/Schema-OG stages architecture
already defines. Treated as elaborations explicitly requested by this
phase's own instructions, not deviations — see the final answer below
for the complete, sprint-wide deviation check.

### Gap closure — viewport, charset, Microdata, RDFa (post-Phase 3.3)

Phase 3.3's own deviation check (above) surfaced two genuine gaps
against architecture.md §9.2's Metadata and Schema/OG bullets —
`viewport`/`charset` extraction, and Microdata/RDFa as the other two
ways Schema.org can be expressed alongside JSON-LD. This pass closes
both, strictly scoped to those four items only (no other stage
touched), reusing Phase 3.2/3.3's existing HTML parsing pipeline
without duplicating any parser or fetch logic.

- [x] Viewport meta extraction: `metadata.ts`'s `PageMetadata` gained
      `viewport: string | null` — the raw `content` of
      `<meta name="viewport">`, run through the same `normalizeText`
      helper every other text field already uses. No new selector
      pattern, no new dependency.
- [x] Charset extraction: `metadata.ts`'s `PageMetadata` gained
      `charset: string | null`, resolved through a three-tier fallback
      matching how real pages actually declare it, in priority order:
      (1) `<meta charset="...">`'s attribute directly: (2)
      `<meta http-equiv="Content-Type" content="...; charset=...">`'s
      `charset` parameter (`http-equiv` matched case-insensitively via
      `.toLowerCase()` in JS, not a CSS4 attribute-selector `i` flag,
      since Cheerio's underlying `cheerio-select`/`css-select` support
      for that flag isn't a given); (3) the HTTP response's own
      `Content-Type` header's `charset` parameter — already captured by
      `FetchedResource.headers` from Phase 3.2, so reading it here adds
      no new network call. `extractMetadata`'s signature grew a third
      `headers: Record<string, string>` parameter to make tier 3
      possible; `index.ts`'s `analyzePage` was updated to pass
      `acquisition.page.headers` through at the one call site.
- [x] Schema.org Microdata extraction: `structured-data.ts` gained
      `extractMicrodata` — selects every `[itemscope]` element, reads
      its `itemtype` attribute (space-separated, so a single element
      can declare multiple types), and normalizes each token through a
      new shared `lastPathSegment` helper.
- [x] Schema.org RDFa extraction: `structured-data.ts` gained
      `extractRdfa` — selects every `[typeof]` element, same
      space-separated multi-value handling and normalization as
      Microdata. RDFa also permits bare vocab-relative terms (e.g.
      `typeof="LocalBusiness"` alongside a page-level `vocab="
  https://schema.org/"` attribute, rather than a full URI) —
      `lastPathSegment` handles this by falling back to the raw token
      untouched whenever it fails to parse as a URL, without needing to
      resolve `vocab`/`prefix` context.
- [x] `StructuredDataResult` restructured from a JSON-LD-only shape
      into `{ types, jsonLd, microdata, rdfa }`: `types` is now the
      **union** of type names found across all three formats, and each
      format's own block/item count and type list is still available
      under its own key for anything that needs to distinguish them.
      Safe to restructure — nothing outside `modules/intelligence/analysis/`
      consumed the old shape yet (confirmed by search: no route, UI
      component, or other module referenced `StructuredDataResult`,
      `extractStructuredData`, or `analyzePage`'s return value before
      this change).

**Verification:** `npm run format`, `npm run lint`, `npx tsc --noEmit`,
and `npm run build` all pass (same one pre-existing benign React
Compiler / TanStack Table warning, unrelated to this change). Verified
live against real HTML from three sites, not just typecheck:
`example.com` (no `<meta charset>`, no `Content-Type` charset param,
no HTTP header charset param either — `charset: null` is the
byte-for-byte-correct result, confirmed independently via `curl -sI`),
`github.com` (`charset: "utf-8"` via the `<meta charset>` tag,
`viewport: "width=device-width"`), and `schema.org/Person` specifically
to exercise real-world Microdata (38 `[itemscope]` elements, correctly
yielding `BreadcrumbList`/`ListItem`/`SoftwareSourceCode` types) and
confirm the combined `types` union includes results from both JSON-LD
and Microdata on the same page. RDFa's `[typeof]` selector and the
`vocab`-relative fallback path in `lastPathSegment` did not have a live
`[typeof]`-bearing page available in this pass — that specific code
path is covered by the general JSON-LD/Microdata normalization logic
being identical (same function, same tokenizing), but is worth a
targeted live check against a known RDFa page (e.g. a Drupal or
Wikipedia page using RDFa Lite) in a later phase if one touches this
module again.

**Architecture deviation check for this pass:** none against an
architecture _decision_. Viewport, charset, and Microdata are named
directly in architecture.md §9.2's own Metadata and Schema/OG bullets
("title, desc, lang, viewport, canonical, favicon, charset" and
"JSON-LD/microdata types present"). RDFa itself isn't literally named
in §9.2's bullet or §9.1's flow diagram — same situation as Twitter
Card in Phase 3.3: explicitly named by this pass's own instructions,
fits squarely inside the Schema/OG stage §9.2 already defines (a third
syntax for the same "Schema.org types present" signal JSON-LD and
Microdata already cover), and §9.2's bullets read as representative
examples rather than an exhaustive, closed field list throughout this
sprint. Treated as an elaboration explicitly requested by this pass's
instructions, not a deviation. Nothing else was touched.

### Phase 3.4 — SSL, CMS, tracking, technology, robots/sitemap evaluation

The remaining named stages from architecture.md §9.1/§9.2 not yet
built: [11 SSL], [5 CMS], Tracking, and full [9 robots.txt]/[10
sitemap.xml] directive/staleness evaluation (retrieval for both shipped
in Phase 3.2 — this phase adds the pure evaluation over what's already
fetched). Every new stage runs through the one `acquireWebsite` fetch
from Phase 3.2 — no route, no database change, same "foundation
already exists, only evaluation is new" shape as Phase 3.3.

- [x] SSL analysis / HTTPS detection / certificate expiration analysis:
      `ssl.ts` (`analyzeSsl`) — [11 SSL] (§9.2 "HTTPS present,
      certificate validity/expiry/issuer"). `fetch`/`undici` don't
      expose the peer certificate through their public API, so this
      needed a genuinely new connection — a dedicated `tls.connect`
      handshake (no HTTP request sent, socket destroyed immediately
      after) against the same host [1 Acquire] already resolved
      (`finalUrl`, post-redirect). This is **not** a duplicate fetch in
      the sense the phase instructions rule out (no second GET, no
      second body read) — it's the one new capability §9.2's SSL bullet
      requires that no existing fetch exposes. Critically, it reuses
      `safeLookup` (Phase 3.2's SSRF-guarded DNS resolution) via `tls.connect`'s
      own `lookup` option, so this new connection carries the exact
      same P0 SSRF protection (architecture.md §13.5) as every other
      analyzer fetch, not a separately-implemented, potentially weaker
      check. `rejectUnauthorized: false` lets the handshake complete
      even for self-signed/expired/mismatched certs — the point of this
      stage is to _report_ on a bad certificate, not refuse to look at
      one — with trust surfaced separately via `isValid`/
      `authorizationError` (`tls.TLSSocket#authorized`). `httpsPresent`
      itself is just `finalUrl`'s protocol — cheap, no connection
      needed for that half.
- [x] Security header analysis: also in `ssl.ts`, purely over
      `acquisition.page.headers` (already captured — no new fetch).
      Checks presence of the six most common response-level security
      headers (`Strict-Transport-Security`, `Content-Security-Policy`,
      `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`,
      `Permissions-Policy`). Not itself named in §9.2's SSL bullet — see
      the deviation check below.
- [x] robots.txt evaluation: `robots.ts` gained `evaluateRobotsTxt` —
      [9 robots.txt]'s "directives" (§9.2), the piece Phase 3.2's
      `fetchRobotsTxt` deliberately deferred. A minimal but real
      `User-agent`/`Disallow`/`Allow` group parser (not a fully
      spec-compliant robots.txt engine — no wildcard/`$`-anchor path
      matching) plus a `disallowsAll` signal (a `*`-covering group with
      `Disallow: /`). Pure function over the already-fetched body — no
      new fetch.
- [x] sitemap.xml evaluation: `sitemap.ts` gained `evaluateSitemap` —
      [10 sitemap.xml]'s "URL count, staleness" (§9.2), the piece Phase
      3.2's `discoverSitemap` deliberately deferred. Parses the
      already-fetched body via a new `parseXml` export on `parse.ts`
      (Cheerio in `xmlMode`, alongside the existing HTML-mode
      `parseHtml` — same one wrapper point, not a second parsing
      dependency). Detects `<sitemapindex>` vs. a plain `<urlset>`,
      counts `<url>`/`<sitemap>` entries accordingly, and reports the
      most recent `<lastmod>` found anywhere plus days-since as a
      staleness signal.
- [x] CMS detection: new `cms.ts` (`detectCms`) — [5 CMS] (§9.2 "via
      `meta[name=generator]`, server/`x-powered-by` headers, and known
      asset-path/JS fingerprints"), implemented exactly that way for
      seven platforms (WordPress, Shopify, Wix, Squarespace, Webflow,
      Drupal, Joomla), each returning its matched evidence rather than
      just a boolean.
- [x] Analytics/tracking detection: new `tracking.ts` (`detectTracking`)
      — Tracking (§9.2 "GA4, GTM, Meta Pixel, LinkedIn Insight, Hotjar
      ... via script src"), via script `src` patterns plus inline
      script content (needed for tools that self-register via an inline
      snippet — GTM containers, Meta Pixel's `fbq('init', ...)` call —
      rather than only an external file).
- [x] Technology detection: new `technology.ts` (`detectTechnologies`)
      — jQuery/React/Next.js/Vue/Angular/Bootstrap/Tailwind, via the
      same asset-path technique plus Cheerio DOM-marker selectors
      (`[ng-version]`, `[data-reactroot]`, `#__next`, ...). Not itself
      named in §9.2 — see the deviation check below.
- [x] Shared signal extraction: new `page-signals.ts`
      (`collectAssetUrls`, `collectInlineScripts`) — CMS, Tracking, and
      Technology detection all need "every script/link/img src or href"
      and/or "every inline script's text"; factored out once rather
      than each of the three new stage files re-implementing the same
      Cheerio selector loop.
- [x] Orchestration: `index.ts`'s `analyzePage` wires in all six new
      outputs (`ssl`, `cms`, `tracking`, `technology`,
      `robotsEvaluation`, `sitemapEvaluation`). `analyzeSsl` — the only
      stage in the whole pipeline doing new network I/O — is started
      immediately after acquisition and awaited last, so its round trip
      overlaps with the synchronous evaluation stages instead of adding
      to the pipeline's latency serially.

**Deliberately not in Phase 3.4** (later Sprint 3 phases, per
instruction): Lead Scoring, AI, Business Detail Page, CRM, Exports. No
browser automation anywhere in this phase or its dependency tree — the
new TLS work is a raw certificate handshake (`node:tls`), not a
browser, and sends no HTTP request of its own.

**Verification:** `npm run format`, `npm run lint`, `npx tsc --noEmit`,
and `npm run build` all pass (same one pre-existing benign warning).
Verified live against five real sites, not just typecheck:
`example.com`/`github.com` (baseline SSL/security-header/robots/sitemap
sanity), `wordpress.org` (WordPress correctly detected via all three
signal types — generator meta, `/wp-content/`/`/wp-includes/` asset
paths; GTM detected via its inline container-ID pattern; robots.txt
directive parsing correctly produced 12 groups including three separate
`User-agent: *` groups and dedicated AI-crawler groups
(`GPTBot`/`ClaudeBot`/etc.) — a real, non-trivial robots.txt that
exercises the group-boundary logic properly; sitemap correctly
identified as a `<sitemapindex>` with 3 child sitemaps and a real
`mostRecentLastmod` 16 days old), `www.allbirds.com` (Shopify correctly
detected via `cdn.shopify.com`/`/cdn/shop/` asset paths; CSP/HSTS/
X-Frame-Options/X-Content-Type-Options all correctly read as present),
and `stripe.com` (Next.js correctly detected via **both** its asset
path and DOM markers — `#__next` and `script#__NEXT_DATA__` — agreeing
with each other; five of six security headers present). Certificate
data was real and internally consistent on every HTTPS site tested
(valid issuer, `daysUntilExpiry > 0`, `isValid: true`). SSRF protection
on the new TLS path was separately verified against `localhost`,
`127.0.0.1`, and the cloud-metadata address (`169.254.169.254`) — all
three correctly returned `certificate: null` rather than completing a
handshake, confirming `safeLookup` blocks the new connection type the
same way it blocks `guardedFetch`'s. Unverified: a site with an
actually-expired or self-signed certificate (`isExpired`/`isValid:
false` paths are implemented per the Node `tls` API's documented
behavior and code-reviewed, but not exercised against a live
adversarial cert in this pass), a robots.txt with a true `Disallow: /`
for `*` (`disallowsAll: true` path), and — as always — anything
requiring a live database (still N/A; this phase doesn't touch one).

**Architecture deviation check for this phase:** two requested items
aren't literally named in architecture.md §9.2's stage-by-stage bullet
summary — security header analysis (§9.2's SSL bullet only lists
"HTTPS present, certificate validity/expiry/issuer") and technology
detection (§9.2 names CMS detection and Tracking scripts as separate
bullets, but no general "technology" bullet). Same reasoning applied to
Twitter Card (Phase 3.3) and RDFa (the metadata gap-closure pass):
both are explicitly named by this phase's own instructions, both use
the exact fingerprinting technique §9.2 already prescribes for CMS
detection (asset-path/DOM-marker matching over the parsed page, no new
data source), and both fit inside the stages architecture.md already
defines — security headers under [11 SSL]'s general "response-level
security posture" concern, technology detection as a natural
generalization of [5 CMS]'s own fingerprinting approach. Treated as
elaborations explicitly requested by this phase's instructions, not
deviations, consistent with how every other named-but-unlisted item
has been handled throughout this sprint.
