# LeadMap — Architecture v2 (Definitive)

**Product:** LeadMap — AI-Powered Lead Intelligence Platform
**Document type:** System Architecture Specification
**Status:** Source of truth. This document defines the entire system. All sprints follow it.
**Audience:** Senior engineering team
**Constraint:** Contains no application code by design. Detailed enough to build from directly.

---

## 0. Executive Summary

LeadMap helps digital marketing agencies **discover real businesses**, **analyze their digital presence**, **score their sales potential**, and **identify opportunities**. It is a focused intelligence tool — not a CRM suite, not an outreach or automation platform.

The system is built on five non-negotiable principles:

1. **Zero-Cost First** — runs entirely on free tiers (Vercel Hobby + Neon/Supabase Postgres free tier). No paid infrastructure is required to operate the MVP.
2. **On-Demand Architecture** — the system does work _only_ when a user asks. No background crawling, scheduling, monitoring, or automatic notifications. Every action is user-triggered.
3. **Official APIs Only** — all business data comes from official Google Maps Platform APIs. No scraping, no ToS circumvention, ever.
4. **Cache First** — every eligible Google response is cached in PostgreSQL and reused. Repeated searches hit the cache, not Google.
5. **Optional AI** — the product is fully functional without AI. AI features unlock only when a user supplies their own provider key (OpenAI, Gemini, or Claude).

The architectural consequence of these principles is a **simple, single-deployable Next.js application backed by one PostgreSQL database** — no worker fleet, no queue, no Redis, no scheduler. Complexity that a heavier product would push into background infrastructure is eliminated here because _nothing runs unless a user triggers it_.

**Baseline stack:** TypeScript · Next.js (App Router, React Server Components) on Vercel · PostgreSQL + PostGIS (Neon/Supabase) · Drizzle ORM · Auth.js · Zod · native `fetch` + Cheerio for analysis · Google Maps Platform · provider-agnostic optional LLM adapter.

---

## 1. Scope — In and Out

### 1.1 In scope (the only modules that exist)

| #   | Module                                  | Purpose                                                                           |
| --- | --------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | **Authentication**                      | Sign-in, sessions, account management                                             |
| 2   | **Dashboard**                           | Landing surface: recent searches, saved leads, follow-ups due                     |
| 3   | **Business Discovery**                  | Manual Google-powered search; table view + map view; filters                      |
| 4   | **Business Intelligence**               | Website analysis, SEO, CMS/social detection, Google Business analysis, Lead Score |
| 5   | **Lead Organization (Lightweight CRM)** | Favorites, notes, status, follow-up date, export                                  |
| 6   | **AI (optional)**                       | AI Audit + Opportunity Reasoning — only when a user key exists                    |
| 7   | **Settings**                            | Google API key, AI API key + provider, user preferences                           |

### 1.2 Explicitly out of scope (removed and must never be built here)

Background scanner · worker services · queue system · Redis · notification engine · scheduled jobs · daily/weekly/monthly scans · automatic business discovery · continuous monitoring · cold email · WhatsApp automation · Instagram DM generation · proposal generation · meeting-script generation · AI sales automation · any autonomous agents · any message/email/copy generation of any kind.

> **Design rule:** if a proposed feature requires the system to act without a direct user request, or to generate outreach content, it is out of scope by definition.

---

## 2. High-Level System Architecture

Everything is synchronous and user-triggered. There is no asynchronous plane.

```
┌───────────────────────────────────────────────────────────────────────────┐
│                                 CLIENT (browser)                            │
│  Next.js React UI (RSC + Client Components)                                 │
│  Google Maps JavaScript API  ← rendered with user's referrer-restricted key │
│  Table View · Map View · Business Detail · Lead Organizer · Settings        │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                 │ HTTPS (RSC payloads / JSON)
                                 ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                        VERCEL (single Next.js app)                           │
│  Edge middleware: auth gate · input guard · Postgres-backed rate limiting    │
│  ── React Server Components (reads, cached data, dashboards)                  │
│  ── Route Handlers (mutations + on-demand actions: search, analyze, AI)      │
│  ── Server-side Google & AI calls (secrets never reach the browser)          │
│                                                                              │
│  NO workers · NO queue · NO Redis · NO cron · NO background scanning         │
└───────────────┬──────────────────────────────────────────┬──────────────────┘
                │                                            │
                ▼                                            ▼
┌───────────────────────────────────┐        ┌──────────────────────────────────┐
│      PostgreSQL (Neon/Supabase)   │        │        EXTERNAL APIS              │
│  + PostGIS  + full-text search    │        │  Google Places / Place Details /  │
│                                   │        │  Geocoding (server-side, cached)  │
│  System of record:                │        │  Google Maps JS (client-side)     │
│   users, settings(encrypted keys) │        │                                   │
│   favorites, notes                │        │  User's LLM provider (optional):  │
│  Shared cache plane:              │        │   OpenAI / Gemini / Claude        │
│   businesses (Place ID dedup)     │        │                                   │
│   search_cache, website_analyses, │        │  Target websites (public pages,   │
│   lead_scores, ai_results         │        │   HTTP GET only, SSRF-guarded)    │
│   scoring_rules, rate_limits      │        └──────────────────────────────────┘
└───────────────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  OBSERVABILITY (free tiers): Sentry (errors) · Vercel Analytics · uptime     │
└───────────────────────────────────────────────────────────────────────────┘
```

**Request lifecycle (representative — a search):**

1. User submits Country → City → District → Category → Keyword.
2. Route Handler computes a **search signature** and checks `search_cache`.
3. **Cache hit (fresh):** return cached business set from Postgres. Zero Google cost.
4. **Cache miss/stale:** call Google Places (server-side, user's key), **upsert businesses by `google_place_id`** (dedup), write the search→results mapping with an expiry, return.
5. Client renders table + map. All subsequent detail/analysis/AI actions are separate user-triggered requests.

---

## 3. Core Modules (detail)

**1. Authentication** — Email/password and OAuth (Google/GitHub) via Auth.js with secure, httpOnly session cookies. Handles sign-up, sign-in, sign-out, session refresh, and account settings. Single-user accounts (no multi-seat org model required by scope; the schema leaves room for it — see §5).

**2. Dashboard** — A pull-based landing page rendered as RSC. Shows: recent searches (from `search_cache` owned by the user), saved leads (favorites), and **follow-ups due today** (favorites where `follow_up_at <= today`). Nothing is pushed; the dashboard simply _queries state at load time_. This is how "follow-up" works without any notification engine or scheduler.

**3. Business Discovery** — Manual, staged search (§8) powered by Google Places + Geocoding. Presents results in a **Table View** (sortable, filterable, paginated, virtualized) and a **Map View** (Google Maps JS with markers). Filters operate over cached results (category, rating, has-website, score band, etc.).

**4. Business Intelligence** — On opening a business: enrich via Place Details (cached), run the **Website Analysis pipeline** (§9), compute the **Lead Score** (§10), and present a Google Business analysis (rating, review count, category, presence signals). All results are stored and reused.

**5. Lead Organization (Lightweight CRM)** — A _personal organizer_ for discovered leads, explicitly **not** an outreach/automation CRM. Capabilities: **favorite** a business, attach **notes**, set a **status** label (e.g., New / Reviewing / Qualified / Not a fit / Won — a manual tag, no automation), set a **follow-up date** (surfaced on the dashboard), and **export** selected leads to CSV/XLSX. No messaging, no email, no reminders-by-notification.

**6. AI (optional)** — Two features only: **AI Audit** (structured critique of a business's digital presence from its stored analysis) and **Opportunity Reasoning** (a structured explanation of _why_ the business is or isn't a promising sales opportunity, grounded in the score + analysis). Available only when the user has stored a valid provider key. No message/email/proposal generation of any kind (§11).

**7. Settings** — Manage the **Google API key**, the **AI API key + provider selection**, and **user preferences** (default country/city, results-per-page, table columns, units). Keys are validated on save and stored **encrypted at rest** (§13.4).

---

## 4. Folder Structure

A **single Next.js application** (no monorepo) — the simplest structure that fits the scope and the zero-cost target. Business logic lives in framework-light `modules/` so it stays testable and portable, while `app/` remains a thin transport layer.

```
leadmap/
├── app/                          # Next.js App Router — transport only, no business rules
│   ├── (auth)/                   # sign-in / sign-up routes
│   ├── (dashboard)/              # authenticated shell: dashboard, discovery, business, leads, settings
│   │   ├── discovery/
│   │   ├── business/[id]/
│   │   ├── leads/
│   │   └── settings/
│   └── api/                      # Route Handlers (mutations + on-demand actions)
│       ├── discovery/            # search endpoint
│       ├── business/             # details, analyze, score
│       ├── ai/                   # audit, reasoning (guarded by key presence)
│       └── export/                # streamed CSV/XLSX
│
├── modules/                      # Domain logic — no Next.js/React imports
│   ├── auth/                     # session, account, RBAC-ready policies
│   ├── google/                   # Places/Details/Geocoding clients + cache-aware access
│   ├── discovery/                # search orchestration + signatures + dedup
│   ├── intelligence/
│   │   ├── analysis/             # website analysis pipeline + stages
│   │   └── scoring/              # modular lead-score engine (data-driven rules)
│   ├── crm/                      # favorites, notes, status, follow-up, export
│   ├── ai/                       # provider adapters, prompt registry, structured output
│   └── shared/                   # domain primitives, errors, result types
│
├── lib/                          # cross-cutting infra
│   ├── db/                       # Drizzle client + query helpers (central tenant/user scoping)
│   ├── crypto/                   # AES-256-GCM envelope encryption for user keys
│   ├── rate-limit/               # Postgres-backed limiter
│   ├── validation/               # Zod schemas shared by API + forms
│   └── observability/            # logger, error reporting wrappers
│
├── db/
│   ├── schema/                   # table/entity definitions (single source)
│   ├── migrations/               # forward-only migrations
│   └── seed/                     # seed data incl. default scoring ruleset
│
├── components/                   # UI: table, map, charts, forms, primitives (shadcn/ui)
├── config/                       # env parsing/validation, constants, feature flags
├── docs/                         # ADRs, runbooks, this document
└── (project config files)
```

**Why this shape**

- **`app/` is thin.** Route Handlers and Server Components call `modules/`; they contain no business rules. This keeps logic out of the framework and makes a future mobile client or public API a matter of adding a new caller — not a rewrite.
- **`modules/` is framework-free.** Each domain (Google, discovery, analysis, scoring, CRM, AI) is isolated and unit-testable. External APIs sit behind anti-corruption layers (`modules/google`, `modules/ai`) so a provider change touches one folder.
- **`lib/db` centralizes scoping.** Every user-scoped read/write goes through shared helpers that inject the owning user's id — accidental cross-user leakage is designed out, not guarded per-callsite.
- **`db/schema` is the single schema.** One migration history; no drift.
- **`docs/adr`** captures every non-trivial decision so the team can build without re-litigating design.

---

## 5. Database Design

**Engine:** PostgreSQL with the **PostGIS** extension (geospatial) and native **full-text search**. Both are available on Neon and Supabase free tiers. One engine covers relational, geospatial, JSONB, and search needs — no second datastore, in keeping with Zero-Cost First.

### 5.1 Two data planes

- **User plane (scoped to the owning user):** `users`, `user_settings`, `favorites`, `notes`, `ai_results`. Private to each account.
- **Shared cache plane (global, deduplicated):** `businesses`, `search_cache`, `website_analyses`, `lead_scores`, `scoring_rules`, `scoring_rulesets`. Populated by any user's on-demand action and reused by all, because the same real business searched by two agencies should cost one Google call, not two. This is the mechanism that makes Cache First real.

> The schema carries an `organization_id` seam (nullable, defaulting to the user's personal org) so a future multi-seat model can be added without a migration of existing rows. Scope requires only single users today; the design does not preclude teams later.

### 5.2 Entities (data dictionary)

Types are logical design intent, not DDL.

**`users`**
`id (uuid pk)` · `email (citext unique)` · `name` · `password_hash (nullable, for OAuth-only)` · `auth_provider` · `created_at` · `updated_at` · `deleted_at (nullable)`

**`user_settings`** — one row per user
`user_id (fk pk)` · `google_api_key_enc (bytea, encrypted)` · `ai_provider (enum: openai|gemini|claude|null)` · `ai_api_key_enc (bytea, encrypted, nullable)` · `preferences (jsonb)` · `updated_at`

**`businesses`** — GLOBAL canonical business + Place Details cache
`id (uuid pk)` · `google_place_id (text unique)` · `name` · `category` · `phone (nullable)` · `website_url (nullable)` · `address` · `country` · `city` · `district (nullable)` · `location (geography POINT — PostGIS)` · `google_rating (nullable)` · `google_review_count (nullable)` · `place_summary (jsonb — permitted cached fields)` · `details_fetched_at (nullable)` · `details_expires_at (nullable)` · `first_seen_at` · `updated_at`
_The `google_place_id` is the durable dedup + join key (storable indefinitely). Detail fields carry an expiry (§6)._

**`search_cache`** — GLOBAL search reuse + dedup
`id (uuid pk)` · `signature (text unique)` · `params (jsonb — normalized query)` · `place_ids (jsonb array — ordered result Place IDs)` · `result_count (int)` · `provider_page_tokens (jsonb, nullable)` · `created_at` · `expires_at` · `last_accessed_at`
_`signature` is a stable hash of normalized search params + geo; identical searches collapse to one row._

**`website_analyses`** — GLOBAL latest analysis per business
`id (uuid pk)` · `business_id (fk)` · `url_analyzed` · `final_url` · `status (enum: ok|partial|failed)` · `http_status (nullable)` · `ssl (jsonb)` · `metadata (jsonb — title/desc/OG)` · `schema_org (jsonb)` · `seo (jsonb)` · `cms (jsonb)` · `tracking (jsonb)` · `social (jsonb)` · `robots (jsonb)` · `sitemap (jsonb)` · `content_hash` · `analyzer_version` · `analyzed_at` · `expires_at`
_One current row per business. On a manual re-run, the row is updated and (optionally) the prior copy appended to `analysis_history`._

**`analysis_history`** — OPTIONAL, GLOBAL, append-only (populated only on manual re-analysis; never scheduled)
`id (uuid pk)` · `business_id (fk)` · `analysis (jsonb — frozen result)` · `content_hash` · `analyzer_version` · `captured_at`

**`lead_scores`** — GLOBAL current score per business
`id (uuid pk)` · `business_id (fk unique)` · `total (int 0–100)` · `breakdown (jsonb — per-rule contribution + reason)` · `ruleset_version (int)` · `computed_at`

**`scoring_rules`** — configurable rules (§10)
`id (uuid pk)` · `key (text unique)` · `name` · `description` · `category` · `expression (jsonb — condition DSL)` · `weight (numeric)` · `max_points (int)` · `enabled (bool)` · `version (int)` · `created_at` · `updated_at`

**`scoring_rulesets`** — versioned collections for reproducibility
`id (uuid pk)` · `version (int unique)` · `label` · `rule_keys (jsonb array)` · `is_active (bool)` · `published_at`

**`favorites`** — USER plane (a user's saved lead)
`id (uuid pk)` · `user_id (fk)` · `business_id (fk)` · `status (enum: new|reviewing|qualified|not_fit|won)` · `priority (nullable int)` · `follow_up_at (date, nullable)` · `custom_fields (jsonb)` · `created_at` · `updated_at` · `deleted_at (nullable)` · **unique `(user_id, business_id)`**

**`notes`** — USER plane
`id (uuid pk)` · `user_id (fk)` · `business_id (fk)` · `body (text)` · `pinned (bool)` · `created_at` · `updated_at` · `deleted_at (nullable)`

**`ai_results`** — USER plane (cached AI output; the user paid for it with their key)
`id (uuid pk)` · `user_id (fk)` · `business_id (fk)` · `type (enum: audit|opportunity)` · `provider` · `prompt_version` · `input_hash` · `output (jsonb — structured, schema-validated)` · `created_at` · **unique `(user_id, business_id, type, input_hash)`**

**`rate_limits`** — Postgres-backed limiter state
`id (uuid pk)` · `subject (text — user id or ip)` · `bucket (text — route/action)` · `window_start (timestamptz)` · `count (int)` · **unique `(subject, bucket, window_start)`**

**`audit_logs`** — lightweight security trail (auth events, key changes, rule edits)
`id (uuid pk)` · `user_id (nullable)` · `action` · `entity_type` · `entity_id (nullable)` · `metadata (jsonb)` · `ip` · `occurred_at`

### 5.3 Relationships

- `users 1─1 user_settings`
- `users 1─* favorites *─1 businesses` (a user's saved leads reference shared businesses)
- `users 1─* notes`, `users 1─* ai_results`
- `businesses 1─1 website_analyses` (current) and `businesses 1─* analysis_history` (optional history)
- `businesses 1─1 lead_scores`
- `search_cache *→ businesses` by Place ID (logical, via `place_ids`)
- `scoring_rulesets *─* scoring_rules` (via `rule_keys`)

### 5.4 Indexes

| Table                 | Index                                                                                 | Purpose                            |
| --------------------- | ------------------------------------------------------------------------------------- | ---------------------------------- |
| `businesses`          | unique btree `google_place_id`                                                        | Dedup / upsert                     |
| `businesses`          | GIST `location`                                                                       | Map bounds + radius queries        |
| `businesses`          | GIN tsvector(name+category+city)                                                      | Text search over cached businesses |
| `businesses`          | btree `(country, city, district)`, `(category)`                                       | Faceted filtering                  |
| `search_cache`        | unique btree `signature`                                                              | O(1) cache lookup                  |
| `search_cache`        | btree `expires_at`                                                                    | Efficient expiry sweeps on read    |
| `website_analyses`    | unique btree `business_id`                                                            | One-current-row + fast join        |
| `lead_scores`         | btree `(total desc)`                                                                  | "Top opportunities" ordering       |
| `favorites`           | unique `(user_id, business_id)`; btree `(user_id, status)`, `(user_id, follow_up_at)` | Lead lists + dashboard follow-ups  |
| `notes`               | btree `(user_id, business_id, created_at desc)`                                       | Note timeline                      |
| `ai_results`          | unique `(user_id, business_id, type, input_hash)`                                     | AI cache hits                      |
| `rate_limits`         | unique `(subject, bucket, window_start)`                                              | Atomic counter upserts             |
| soft-deletable tables | **partial** indexes `WHERE deleted_at IS NULL`                                        | Keep hot sets small                |

### 5.5 Normalization, soft deletes, growth

- **Normalized:** businesses are stored once and referenced; user annotations are separate rows; scoring rules are data. No duplicated business payloads per user.
- **Soft deletes:** `deleted_at` on user-facing tables (`favorites`, `notes`), filtered centrally in `lib/db`. Cache tables (`businesses`, `search_cache`, analyses) are not soft-deleted; they are governed by TTL and purged/refreshed lazily (§6).
- **Millions-of-businesses readiness:** UUID keys, indexed geo/text, and time-stampable cache rows make the schema partition-ready (range-partition `analysis_history`/`audit_logs` by month when they grow). See §16 for how this reconciles with free-tier storage limits.

---

## 6. Cache Strategy (PostgreSQL, no Redis)

Cache First is implemented entirely in Postgres. There is no separate cache server; the cache _is_ durable rows with expiries, refreshed **lazily on the next user request** (never by a background job, per On-Demand Architecture).

### 6.1 What is cached, and for how long

| Data                                           | Table                                             | TTL                                           | Rationale                                                                               |
| ---------------------------------------------- | ------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Place ID** (identity)                        | `businesses.google_place_id`                      | **Indefinite**                                | Place IDs are stable identifiers permitted for long-term storage; the dedup backbone    |
| **Search results** (Place ID list for a query) | `search_cache`                                    | **7–14 days** (configurable)                  | Search intent is stable short-term; refresh keeps results current                       |
| **Place Details** (name/phone/website/hours)   | `businesses.place_summary` + `details_expires_at` | **~30 days** (ToS-bounded)                    | Bounded caching for performance within Google's terms                                   |
| **Website analysis**                           | `website_analyses` + `expires_at`                 | **30–90 days** (our data)                     | This is _our_ derived data; longer TTL is fine, but stale analysis is re-run on request |
| **Lead score**                                 | `lead_scores`                                     | Recomputed when analysis or ruleset changes   | Derived; cheap to recompute                                                             |
| **AI results**                                 | `ai_results`                                      | Indefinite until inputs change (`input_hash`) | The user paid tokens; never re-spend for identical input                                |
| **Ratings / reviews text / photo bytes**       | **not stored**                                    | —                                             | Refreshed live via Place Details / rendered by reference; see ToS note (§7)             |

### 6.2 TTL and refresh (lazy, read-through)

On every read the access path checks freshness:

- **Fresh (`expires_at > now`):** serve from Postgres. No external call.
- **Stale (`expires_at <= now`):** perform the external call _within the same user request_, update the row, bump `expires_at`, then serve. Because work is only ever user-triggered, "refresh" naturally coincides with the next user who needs the data — no scheduler required.
- **`last_accessed_at`** is stamped on read so rarely-used cache rows are identifiable for later purge.

### 6.3 Duplicate prevention (the core of Cache First)

- **By identity:** every business upsert is keyed on `google_place_id` (unique). The same business returned by different searches, districts, or users resolves to **one row**.
- **By query:** each search is reduced to a normalized **signature** — a hash of `{country, city, district, category, keyword}` after trimming/lowercasing/canonicalizing. Identical searches (even across users) map to the same `search_cache` row, so a repeated search is a single indexed lookup, not a new Google request.
- **Upsert semantics:** discovery writes are idempotent — insert-or-update on the unique keys — so concurrent identical searches converge safely without duplicates.

### 6.4 Cache invalidation

- **Time-based (primary):** TTL expiry as above.
- **Event-based:** re-running an analysis invalidates the score (recompute); publishing a new scoring ruleset marks affected `lead_scores` for recompute-on-next-read.
- **Manual:** a user can force-refresh a business (re-fetch details, re-run analysis) — an explicit, user-triggered invalidation that respects rate limits.
- **Purge:** expired/cold cache rows are cleaned opportunistically during reads (small, bounded deletes on `expires_at` indexes). No cron; the system self-prunes as it is used. If volume ever warrants a heavier sweep, it remains a manual/administrative action, not a scheduled worker.

---

## 7. Google Integration

> **Terms-of-Service note (mandatory review before launch):** Google Maps Platform permits **storing Place IDs indefinitely** and allows **limited, temporary caching** of some content strictly to improve performance (historically up to ~30 days), but it **restricts long-term storage** of much Place Content and prohibits storing/serving certain fields (e.g., photos, some review data) outside its terms. These terms change. The cache TTLs in §6 are set to respect this, and the product's durable value (analysis + scoring) is built from **our own derived data**, not warehoused Google Content. **The team must verify the current Google Maps Platform Terms of Service and confirm compliance before production.**

### 7.1 How each API is used

| API                     | Where           | Use                                                                     | Cached?                                                                              |
| ----------------------- | --------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Places Search**       | Server-side     | Discovery by category/keyword within a geographic area                  | Result Place-ID list → `search_cache` (TTL)                                          |
| **Place Details**       | Server-side     | Enrich a business (phone, website, hours, category)                     | Permitted fields → `businesses.place_summary` (~30-day TTL)                          |
| **Geocoding**           | Server-side     | Resolve Country/City/District to coordinates for search + map centering | Coordinates cached in `businesses.location` (geocoded coords are storable)           |
| **Maps JavaScript API** | **Client-side** | Interactive map + markers                                               | Not server-cached; rendered live with the user's **referrer-restricted** browser key |

### 7.2 Key handling

- The user provides **their own Google Cloud API key(s)** in Settings.
- **Server key** (Places/Details/Geocoding): stored **encrypted at rest**, used only server-side, restricted to the specific Google APIs it needs. (Note: Vercel serverless has no fixed egress IP, so IP-restriction isn't reliable on the zero-cost target — we rely on **API-scoped restriction** plus encrypted server-only storage. This trade-off is documented in Risks §18.)
- **Browser key** (Maps JS): exposed to the client by necessity (all Maps-JS keys are), and secured by **HTTP-referrer restrictions** the user configures for their domain. The user may use one appropriately-restricted key or two keys; the app supports both.

### 7.3 Cost & quota discipline

- All server-side Google calls are **cache-first** (§6): the cache is consulted before Google every time.
- **Field masks** on Place Details request only the fields we display, minimizing billed data.
- Discovery is **manual and deduplicated** — never blanket area crawling — so the user's Google quota is spent only on genuinely new searches. Because users bring their own keys, cost accrues to the user; the cache still minimizes it out of good citizenship and performance.

---

## 8. Business Discovery (flow)

Discovery is **manual and staged**. There is no automatic city scan, no crawling, no discovery without an explicit user search.

```
Country ▸ City ▸ District ▸ Business Category ▸ Keyword ▸ [Search]
   │        │       │             │                │
   └────── Geocoding resolves the area ────────────┘
                         │
                  compute signature
                         │
             ┌───────────┴────────────┐
             ▼                         ▼
      search_cache HIT           search_cache MISS
     (fresh, within TTL)                │
             │                Google Places Search (server, user key)
             │                          │
             │                 upsert businesses (dedup by Place ID)
             │                 write search_cache (+ expires_at)
             └───────────┬──────────────┘
                         ▼
             Return business set → render
                         │
          ┌──────────────┴───────────────┐
          ▼                              ▼
     TABLE VIEW                      MAP VIEW
  sortable · filterable          Google Maps JS + markers
  paginated · virtualized        (client, referrer-restricted key)
```

- **Inputs** are validated (Zod) and normalized before signature computation.
- **Filters** (rating, has-website, category, score band, distance) apply to the returned/cached set — client-side for the current page, server-side (indexed) for larger result sets.
- **Pagination** is cursor/offset over the cached result list; Google page tokens (if used to fetch more) are stored on the `search_cache` row so "load more" can extend a cached search without restarting it.

---

## 9. Website Analysis Pipeline

A **staged, HTTP-only, fault-isolated** pipeline that runs **inside the user's request** and completes within Vercel's function time limit. **No headless browser** is used — this keeps analysis fast, free, and within serverless constraints. (Trade-off: JS-rendered SPAs are analyzed from their served HTML only; documented in §18.)

### 9.1 Flow

```
[1 Acquire]  HTTPS GET the site (SSRF-guarded: block private/link-local/metadata IPs,
             cap redirects, cap response size, enforce timeout, descriptive User-Agent)
      │      → HTML + response headers + TLS/cert info
      ▼
[2 Parse]    Parse HTML with Cheerio (server-side DOM, no JS execution)
      ▼
   ┌────────────── evaluate (cheap, in-process) ──────────────┐
   ▼          ▼          ▼           ▼          ▼          ▼
[3 Metadata][4 SEO]  [5 CMS]    [6 Tracking][7 Social] [8 Schema/OG]
 title,      titles,  generator/  GA4/GTM/    profile    JSON-LD types,
 desc, lang, meta,    headers/    Meta Pixel/ links      microdata,
 canonical   H-tags,  known paths /Hotjar via + validity  og:* coverage
             indexable fingerprints script src
   │          │          │           │          │          │
   ▼          ▼          ▼           ▼          ▼          ▼
[9 robots.txt]   [10 sitemap.xml]        [11 SSL]
 fetch + parse    fetch + presence/       from the HTTPS handshake:
 directives,      URL count, staleness    cert validity, expiry, issuer
 sitemap refs
      └──────────────── assemble ────────────────┘
                        ▼
[12 Assemble] normalize → validate (Zod) → content_hash → analyzer_version
                        ▼
[13 Persist]  upsert website_analyses (current) + expires_at
              (optional) append prior copy to analysis_history on manual re-run
                        ▼
[14 Score]    feed normalized analysis into the Lead Score engine (§10)
```

### 9.2 What each stage produces

- **Metadata:** `<title>`, meta description (+ presence/length), lang, viewport, canonical, favicon, charset.
- **SEO (basic):** title/description quality, single-H1 check, heading hierarchy, canonical correctness, `noindex`/`nofollow`, indexability verdict.
- **CMS detection:** WordPress/Shopify/Wix/etc. via `meta[name=generator]`, server/`x-powered-by` headers, and known asset-path/JS fingerprints.
- **Tracking scripts:** analytics/ads/heatmap tags (GA4, GTM, Meta Pixel, LinkedIn Insight, Hotjar, …) — a strong maturity/spend signal.
- **Social links:** outbound Facebook/Instagram/LinkedIn/X/TikTok/YouTube links; dedupe + validate; flag missing majors.
- **Schema / OpenGraph:** JSON-LD/microdata types present; OG tag coverage/validity.
- **robots.txt / sitemap.xml:** presence, directives, sitemap declarations, URL count/staleness.
- **SSL:** HTTPS present, certificate validity/expiry/issuer.

### 9.3 Governance

- **Public data only**, `robots.txt` respected, polite single-request analysis (no crawling of many pages), bounded time/size.
- **Versioned** (`analyzer_version`) and **change-detectable** (`content_hash`) so a re-run can tell whether anything actually changed.
- Each stage is independently guarded; a failing stage yields `status = partial` rather than failing the whole analysis.

---

## 10. Lead Score Engine

**Goal:** a modular engine where **rules are configurable data**, new rules are added **without rewriting the engine**, scores are **explainable**, and past scores are **reproducible**.

### 10.1 Model

- A **rule** is data: `{ key, category, expression, weight, max_points, enabled, version }` in `scoring_rules`.
- The **expression** is a serialized, sandboxed boolean/DSL condition (e.g., a JSON-Logic-style tree) evaluated against a flattened **scoring context** built from the business + latest analysis, for example:
  `{ has_ssl, has_website, cms, has_ga4, has_meta_pixel, seo.title_ok, seo.h1_ok, has_sitemap, schema_present, social.count, google.rating, google.review_count, ... }`
- A **ruleset** (`scoring_rulesets`) is a versioned, ordered collection of active rule keys.

### 10.2 How scoring runs

```
context      = flatten(business + latest website_analysis)
ruleset      = active ruleset (cached in memory; invalidated on publish)
for rule in ruleset where enabled:
    matched  = evaluate(rule.expression, context)     # pure, allow-listed operators only
    points   = matched ? min(rule.weight_contribution, rule.max_points) : 0
    breakdown.push({ key, matched, points, reason })
total        = normalize(sum(points)) → 0..100
persist lead_scores(total, breakdown, ruleset_version)
```

- **Explainability:** the stored `breakdown` (which rules fired, points, and a human reason) is shown in the UI so agencies see _why_ a business scores as it does.
- **Reproducibility:** `ruleset_version` is recorded with every score, so a past score can be explained or recomputed even after rules change.

### 10.3 Adding rules without changing code

- New rules are inserted as data (admin form or seed migration): define category, expression, weight, `max_points`, enable → publish a new ruleset version.
- The engine reads the **active ruleset from the DB** (cached, invalidated on publish). **No deploy** is needed to change scoring behavior.
- **Safety:** expressions run through a **sandboxed evaluator with an allow-listed operator set** (no arbitrary code execution). Each rule is validated and **dry-run against sample contexts** before it can be published; changes are audited; rulesets are versioned for instant rollback.
- **Performance:** evaluation is O(rules) over an in-memory context — trivially cheap, even across large result sets.

---

## 11. AI Layer (optional, bring-your-own-key)

AI is **strictly optional**. The entire application works with **no AI key**. AI features appear only when the user has stored a valid provider key.

### 11.1 Providers & abstraction

- Supported: **OpenAI, Gemini, Claude**.
- A single **provider adapter interface** (`generateStructured`) is implemented for each provider. Business code depends on _our_ interface, never a vendor SDK, so providers are interchangeable and future models slot in without touching callers.
- Provider + key come from `user_settings`; the key is decrypted server-side per request and never sent to the client.

### 11.2 The only two features

- **AI Audit** — input: the stored `website_analysis` + business facts. Output: a **structured** critique — strengths, weaknesses, and concrete digital-presence gaps (e.g., missing tracking, weak SEO signals, no schema). No prose outreach, no messaging.
- **Opportunity Reasoning** — input: `lead_score.breakdown` + analysis + Google Business signals. Output: a **structured** explanation of _why_ the business is or isn't a promising sales opportunity for an agency, with the reasoning tied to specific signals.

**Explicitly forbidden AI outputs:** emails, cold messages, WhatsApp/Instagram DMs, proposals, meeting scripts, or any content intended to be sent to the business. The AI _analyzes and reasons_; it never _drafts outreach_.

### 11.3 Structured output, caching, reliability

- **Structured output:** every AI call requests JSON conforming to a schema and is **validated with Zod** on return; an invalid response triggers one repair retry, then a graceful "AI unavailable" state — the app never breaks when AI does.
- **Caching:** results are cached in `ai_results` keyed by `(user, business, type, input_hash)`. Identical inputs are **never re-billed** to the user's key. If the underlying analysis changes, `input_hash` changes and a fresh result is produced.
- **Reliability:** timeouts and a single retry with backoff on transient errors; on hard failure, the feature degrades to an informative empty state. Because AI runs in-request, prompts are sized to the provider and (where supported) **streamed** to stay within Vercel's function limit and keep latency perceptible.
- **Cost transparency:** since the user pays, the UI makes clear that AI actions consume their provider quota; caching + explicit triggering keep spend minimal and predictable.

### 11.4 Prompt hygiene & injection safety

- Prompts are **versioned** (`prompt_version`) named templates, not scattered literals.
- Website-derived text is **untrusted input**: it is inserted as clearly delimited data, the model is instructed to treat it as content-to-analyze (not instructions), and outputs are schema-constrained — mitigating prompt injection from analyzed pages.

---

## 12. API Design

The client is served primarily by **React Server Components** (reads) and **Route Handlers** (mutations + on-demand actions). Conventions below apply to JSON endpoints.

### 12.1 Conventions

- **Versioning:** internal endpoints under `/api/...`; if/when a public API is added it is namespaced `/api/v1/...`. URL versioning for cache-friendliness.
- **Resources:** plural nouns — `/api/businesses`, `/api/favorites`, `/api/businesses/{id}/notes`.
- **Verbs & codes:** `GET/POST/PATCH/DELETE`; `200/201/204`, `400`, `401`, `403`, `404`, `409`, `422`, `429`, `5xx`.

### 12.2 Response envelope

```
Success: { "data": <resource | resource[]>, "meta": { ...pagination? }, "request_id": "..." }
Error:   { "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] }, "request_id": "..." }
```

### 12.3 Pagination, filtering, sorting

- **Pagination:** cursor-based for large/shared collections (`businesses`), offset for small bounded user lists (`favorites`). `meta.next_cursor` returned where applicable.
- **Filtering:** explicit **allow-listed** params only (`?category=...&min_score=70&has_website=true`) with operator suffixes for ranges (`?score[gte]=70`). No arbitrary query passthrough (injection + performance).
- **Sorting:** `?sort=-score,name` (leading `-` = descending) over **index-backed, allow-listed** fields only.

### 12.4 Authentication & rate limiting

- **Auth:** Auth.js session cookies (httpOnly, secure, sameSite=lax); CSRF protection on mutations. All authenticated endpoints resolve the owning user from the session; user-scoped queries are filtered by that id centrally.
- **Rate limiting (no Redis):** a **Postgres-backed fixed-window limiter** (`rate_limits` table, atomic upsert per `subject+bucket+window`) applied at the edge/middleware. Tighter buckets on expensive actions (search, analyze, AI). Response headers `X-RateLimit-*`; `429 + Retry-After` on exhaustion.
- **Idempotency:** `Idempotency-Key` on paid actions (search/analyze/AI) so client retries don't double-spend the user's Google/AI quota; the first result is stored briefly and replayed on retry.

### 12.5 Representative endpoints

| Method    | Path                                  | Description                                       |
| --------- | ------------------------------------- | ------------------------------------------------- |
| POST      | `/api/discovery/search`               | Staged search (cache-first); returns business set |
| GET       | `/api/businesses`                     | List/filter/sort cached businesses (cursor)       |
| GET       | `/api/businesses/{id}`                | Business + latest details, analysis, score        |
| POST      | `/api/businesses/{id}/details`        | Force-refresh Place Details (rate-limited)        |
| POST      | `/api/businesses/{id}/analyze`        | Run website analysis (in-request)                 |
| POST      | `/api/businesses/{id}/ai/audit`       | AI Audit (only if key present)                    |
| POST      | `/api/businesses/{id}/ai/opportunity` | Opportunity Reasoning (only if key present)       |
| GET/POST  | `/api/favorites`                      | List / create saved leads                         |
| PATCH     | `/api/favorites/{id}`                 | Update status / follow-up / priority              |
| POST      | `/api/businesses/{id}/notes`          | Add note                                          |
| GET       | `/api/export`                         | Stream CSV/XLSX of selected leads                 |
| GET/PATCH | `/api/settings`                       | Read/update keys + preferences                    |

Long/paid actions return promptly because they run **synchronously within the request** and are bounded (HTTP-only analysis; streamed AI). There is no job-polling pattern because there are no jobs.

---

## 13. Security

### 13.1 Authentication

Auth.js with secure, httpOnly, sameSite session cookies; short-lived sessions with refresh; optional MFA; OAuth providers supported. Passwords (when used) hashed with a strong algorithm (bcrypt/argon2 via the auth layer).

### 13.2 Authorization

Single-user ownership model today, enforced by resolving the session user and **centrally scoping every user-plane query** in `lib/db` (never per-callsite). The `organization_id` seam is RBAC-ready for future teams. Shared-plane data (businesses/analyses/scores) is read-only cache to users; only the scoring admin surface can edit rules (audited).

### 13.3 Input validation

**Zod at every boundary** — Route Handlers, forms, and search inputs share the same schemas. All external website content and Google responses are treated as untrusted and validated/normalized before storage or rendering.

### 13.4 Secrets (critical — user-provided keys)

- **Application secrets** (DB URL, encryption master key, OAuth secrets) live in **Vercel environment variables**, per environment, never in code or the client bundle; validated at boot (fail fast).
- **User-provided Google/AI keys** are **encrypted at rest** using **AES-256-GCM envelope encryption** with a server-side master key from the environment. Keys are decrypted only server-side, only when needed, and **never returned to the client** after entry (Settings shows a masked value). Key changes are audited.
- **Maps JS key** is the one intentional client-exposed key, secured by the user's **HTTP-referrer restrictions**.

### 13.5 OWASP Top 10

- **Injection:** parameterized queries via ORM; allow-listed filter/sort fields; no dynamic SQL from input.
- **XSS:** React auto-escaping + strict **CSP**; analyzed HTML is data, never executed; sanitize any rendered external strings.
- **CSRF:** sameSite cookies + anti-CSRF tokens on mutations.
- **Broken access control:** central user scoping + ownership checks + tests.
- **SSRF (sharpest risk):** the analyzer fetches arbitrary URLs → **resolve host, block private/link-local/cloud-metadata ranges, cap redirects, cap size, enforce timeouts, controlled egress**. Treated as a P0 control.
- **Auth failures:** secure sessions, lockout/rate limiting on auth routes, optional MFA.
- **Vulnerable dependencies:** automated dependency scanning (Dependabot/renovate) + SCA in CI.
- **Security misconfig / logging:** hardened security headers, structured audit logging, PII-scrubbed logs.

### 13.6 Abuse prevention

Postgres-backed rate limits + idempotency on paid actions; CAPTCHA/bot defense on sign-up; validation everywhere. Because paid API cost sits on the _user's_ keys, abuse controls focus on protecting the shared DB and preventing account/credential misuse rather than defending a shared API budget.

---

## 14. Performance

- **React Server Components:** data-heavy views (dashboard, business detail, lead lists) render on the server, shipping minimal JS and reading Postgres directly — fast and cheap on Hobby.
- **Lazy loading & code splitting:** dynamic imports for heavy client pieces (Google Map, charts, export dialog); route-level splitting; defer non-critical UI.
- **Pagination:** cursor/offset everywhere; never load unbounded sets.
- **Virtualization:** windowed rendering (TanStack Virtual) for the results table and lead lists so tens of thousands of rows render without DOM blowup.
- **Image optimization:** Next.js `Image` with responsive AVIF/WebP for app assets; **Google business photos are rendered by reference** (via Maps/Places), never re-hosted — avoiding storage cost and Hobby image-optimization limits.
- **Caching:** Cache First (§6) means most reads never touch Google; RSC/data caching and short-TTL response caching reduce repeated work; TanStack Query provides stale-while-revalidate on the client.
- **Database indexes:** the index set in §5.4 targets every hot path (Place-ID dedup, geo bounds, text search, faceted filters, follow-ups, top-score ordering). Hot queries are `EXPLAIN`-checked; JSONB fields get expression/GIN indexes as query patterns emerge.

---

## 15. Deployment

- **Compute:** **Vercel** — one Next.js app (RSC + Route Handlers). `maxDuration` raised toward the Hobby ceiling for the analyze/AI routes; **no cron, no background functions** (on-demand only). Preview deployments per PR.
- **Database:** **Neon (or Supabase) PostgreSQL free tier** with PostGIS enabled; a connection **pooler** in front (Neon pooler / Supabase pooler) is mandatory for serverless connection fan-out.
- **Environment variables:** managed per environment in Vercel; validated at boot; secrets never client-exposed; encryption master key rotated on a schedule.
- **CI/CD:** **GitHub Actions** (free) — lint, typecheck, unit + integration + e2e (Playwright), build, and **gated forward-only migrations**; deploy via Vercel's Git integration to preview → production.
- **Monitoring (free tiers):** **Sentry** (errors + basic performance), **Vercel Analytics** (traffic/Web Vitals), and a free **uptime monitor** (e.g., Betterstack). Structured logs with `request_id` correlation.
- **Backups:** rely on the provider's automated backups + **point-in-time recovery** (Neon/Supabase offer this); schedule periodic **restore drills** (an untested backup is not a backup). Document RPO/RTO. Cache tables are reconstructable on demand, so backup focus is the user plane (`users`, `settings`, `favorites`, `notes`, `ai_results`) and scoring rules.

---

## 16. Scalability (within and beyond the free tier)

The design targets **millions of businesses** structurally while **defaulting to free-tier infrastructure**. These are reconciled honestly:

- **Structural readiness:** normalized schema, UUID keys, PostGIS geo indexes, full-text search, and time-partition-ready history/audit tables mean the schema supports millions of rows without redesign.
- **Practical free-tier reality:** free Postgres tiers cap storage (on the order of ~0.5 GB). **Millions of rich business rows will not fit on the free tier.** This is acceptable _because of the On-Demand + Cache First model_: the system stores only businesses users actually search, so real-world row counts stay modest for a long time. When storage or throughput demands grow, **upgrading the database tier (or adding a read replica) is a non-breaking change** — no schema or code rewrite.
- **Growth path (no re-architecture required):**
  - _More usage:_ raise Vercel plan (see Risk §18 re: commercial use) and Postgres tier; add pooler capacity.
  - _More data:_ enable range partitioning on `analysis_history`/`audit_logs`; archive cold cache rows.
  - _More reads:_ add a read replica for lists/dashboards.
  - _More users/teams:_ activate the dormant `organization_id` seam for multi-seat.

The point: **zero-cost is the default, not a ceiling.** The same architecture scales up by changing plans and toggling latent capabilities, never by rewriting.

---

## 17. Six-Sprint Development Plan

Exactly six sprints. **Each ends with a fully working, deployable application.** No sprint depends on future sprints to run.

### Sprint 1 — Foundation

Next.js app scaffold; Auth.js (email + OAuth); DB schema baseline (`users`, `user_settings`, `rate_limits`, `audit_logs`); AES-GCM key encryption; Settings page to store/validate **Google** and **AI** keys; dashboard shell; Postgres pooler; CI/CD; Sentry; deploy to Vercel + Neon.
**Working app:** sign in, save/validate API keys, see an (empty) dashboard on production.

### Sprint 2 — Business Discovery

Google clients (Places Search + Geocoding); staged manual search (Country→City→District→Category→Keyword); `businesses` (Place-ID dedup) + `search_cache` (signatures, TTL); **Cache First** read-through; **Table View** (filter/sort/paginate/virtualize) + **Map View** (Maps JS with the referrer-restricted key); Postgres rate limiting on search.
**Working app:** search real businesses, see them in table + map, with cached repeat searches.

### Sprint 3 — Business Intelligence

Place Details enrichment (cached, ToS TTL); **Website Analysis pipeline** (HTTP-only: metadata/SEO/CMS/tracking/social/schema/OG/robots/sitemap/SSL) with SSRF guards; **Lead Score engine** + seed ruleset (`scoring_rules`/`scoring_rulesets`); business detail page showing analysis + explainable score + Google Business signals.
**Working app:** open a business, run analysis, get an explainable Lead Score.

### Sprint 4 — Lead Organization (Lightweight CRM)

`favorites` (save + status + priority + **follow_up_at**), `notes`; dashboard surfaces **follow-ups due** (pull-based, no notifications); **export** to CSV/XLSX (streamed, bounded); soft deletes.
**Working app:** save, annotate, status-track, set follow-ups, and export leads.

### Sprint 5 — AI Intelligence (optional)

Provider adapters (OpenAI/Gemini/Claude) behind one interface; key validation per provider; **AI Audit** + **Opportunity Reasoning** with schema-validated structured output; `ai_results` caching by `input_hash`; graceful "no key / AI unavailable" states; prompt-injection hygiene.
**Working app:** with a key, get AI Audit + Opportunity Reasoning; **without a key, the app is fully functional**.

### Sprint 6 — Production Release

Security hardening pass (rate limits, validation coverage, secrets, CSP, OWASP checklist, SSRF review); performance pass (indexes verified, virtualization, lazy loading, RSC caching); observability + structured logging; backup/restore drill; CI/CD gates finalized; documentation + ADRs; commercial-plan checklist (§18).
**Working app:** a hardened, monitored, documented production release.

---

## 18. Risks & Mitigations

| Risk                                       | Description                                                                                              | Mitigation                                                                                                                                                                   |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vercel Hobby is for non-commercial use** | Hobby's terms target personal/non-commercial projects; a commercial launch on Hobby likely violates them | Use Hobby for development/MVP/demo; **move to Vercel Pro at commercial launch** — the architecture is unchanged, only the plan. Budget for this as the single expected cost. |
| **Free-tier Postgres storage/limits**      | ~0.5 GB and auto-suspend won't hold millions of businesses or heavy traffic                              | On-Demand + Cache First keep stored rows to what's actually searched; **upgrade tier / add replica non-disruptively** when needed (§16)                                      |
| **Serverless function time limit**         | Analysis/AI must finish within the Hobby function ceiling                                                | HTTP-only analysis (no headless browser); stream AI; bound response size/redirects; keep work per request small                                                              |
| **No fixed egress IP on serverless**       | Google server key can't be reliably IP-restricted on the zero-cost target                                | Use **API-scoped** key restrictions + encrypted server-only storage; document; a static IP would require paid proxy (deferred)                                               |
| **Google ToS caching limits**              | Long-term storage of some Place Content is restricted                                                    | ToS-compliant TTLs (§6); store only Place IDs + coords long-term; build durable value from **our** derived analysis; **legal review before launch**                          |
| **JS-rendered sites analyzed partially**   | HTTP-only analyzer can't execute SPA JavaScript                                                          | Analyze served HTML + headers (covers most signals); clearly mark confidence; headless rendering intentionally out of scope for cost                                         |
| **SSRF via analyzer**                      | Fetching arbitrary URLs can hit internal/metadata endpoints                                              | Strict private-IP/metadata blocking, redirect/size/time caps, controlled egress — P0                                                                                         |
| **User AI/Google key exposure**            | Storing third-party secrets is sensitive                                                                 | AES-256-GCM at rest, server-only decrypt, masked in UI, never sent to client, audited changes                                                                                |
| **Prompt injection from analyzed pages**   | Malicious page text could hijack AI                                                                      | Untrusted content delimited as data, schema-constrained outputs, model instructed to analyze-not-obey                                                                        |
| **AI provider variability/outage**         | Different providers/models, failures                                                                     | Provider adapter + validation + one repair retry + graceful degradation; app never depends on AI                                                                             |
| **Data accuracy / over-trust in scores**   | Automated scores could mislead                                                                           | Explainable breakdowns, confidence signals, "guidance not verdict" framing                                                                                                   |
| **Privacy/GDPR (business + owner data)**   | Cached business data may include personal data                                                           | Minimization, user-plane erasure via soft delete + purge, regional review, **legal review**                                                                                  |

---

## 19. Recommended Technologies

All choices are free-tier compatible and justified; alternatives noted.

| Concern                | Recommendation                                               | Why                                                                                                       | Alternatives                            |
| ---------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Language               | **TypeScript**                                               | End-to-end type safety across UI, modules, schema                                                         | —                                       |
| Framework              | **Next.js (App Router, RSC)**                                | Server-first rendering, zero-cost on Vercel, single deployable                                            | Remix, SvelteKit                        |
| UI                     | **React + Tailwind + shadcn/ui (Radix)**                     | Accessible, consistent, owned components; fast to build                                                   | Chakra, MUI                             |
| ORM                    | **Drizzle**                                                  | Lightweight, excellent serverless cold-start profile, edge-friendly, tiny footprint — ideal for zero-cost | **Prisma** (richer DX, heavier), Kysely |
| Database               | **PostgreSQL + PostGIS (Neon/Supabase free)**                | Relational + geo + JSONB + full-text in one engine; free tiers with pooling + PITR                        | RDS/Aurora (paid, later)                |
| Auth                   | **Auth.js**                                                  | Free, self-hosted sessions, OAuth support, no external dependency                                         | Clerk (free tier, external), Lucia      |
| Validation             | **Zod**                                                      | One schema reused across API + forms; strong inference                                                    | Valibot (smaller), Yup                  |
| HTTP + parse           | **Native `fetch` (undici) + Cheerio**                        | Fast, dependency-light HTML analysis with no headless browser                                             | JSDOM (heavier)                         |
| Maps                   | **Google Maps JavaScript API**                               | Official, required by scope; user's referrer-restricted key                                               | — (scope-fixed)                         |
| AI                     | **Provider adapter (OpenAI/Gemini/Claude) or Vercel AI SDK** | Provider-agnostic, structured output, streaming                                                           | Direct SDKs, LangChain (heavier)        |
| Encryption             | **Node `crypto` (AES-256-GCM)**                              | Built-in, no dependency, standard envelope encryption for user keys                                       | libsodium                               |
| Rate limiting          | **Postgres-backed limiter**                                  | No Redis; zero-cost; sufficient at this scale                                                             | Upstash free tier (optional)            |
| Client data/state      | **TanStack Query**                                           | SWR caching, less boilerplate                                                                             | SWR, RTK Query                          |
| Table + virtualization | **TanStack Table + TanStack Virtual**                        | Handles large result sets performantly                                                                    | react-window, ag-grid                   |
| Export                 | **SheetJS / streamed CSV**                                   | XLSX/CSV generation in-request, no storage                                                                | csv-stringify                           |
| Monitoring             | **Sentry + Vercel Analytics + uptime**                       | Free tiers cover errors, Web Vitals, uptime                                                               | Grafana stack                           |
| Testing                | **Vitest + Testing Library + Playwright**                    | Fast unit + integration + e2e                                                                             | Jest, Cypress                           |
| CI/CD                  | **GitHub Actions + Vercel Git**                              | Free, gated migrations, preview deploys                                                                   | —                                       |

---

## 20. Final Review — Consistency, Obsolete Concepts, Zero-Cost Alignment

A rigorous pass over the whole design. Every item below was checked against the five core principles; tensions in the requirements are reconciled here explicitly.

**Reconciled inconsistency 1 — "CRM" vs "not a CRM."**
The product is not an outreach/automation CRM, yet a "CRM" module is required. Resolved by scoping Module 5 as **Lead Organization (Lightweight CRM)**: a _personal organizer_ (favorites, notes, status label, follow-up date, export) with **no messaging, email, reminders-by-notification, or automation**. It organizes discovered leads; it does not contact them. This satisfies the module requirement without violating the product identity.

**Reconciled inconsistency 2 — "Follow-up" vs "no notifications / no scheduled jobs."**
Follow-up is implemented as a **passive `follow_up_at` date surfaced on the dashboard at load time** (a pull-based query), not an active reminder. No scheduler, no notification engine, no background job — fully consistent with On-Demand Architecture.

**Reconciled inconsistency 3 — "millions of businesses" vs "free-tier database."**
The **schema is designed for millions** (normalized, indexed, partition-ready), while the **free tier caps actual storage**. Because On-Demand + Cache First store only what users search, real row counts stay small for a long time, and scaling up is a **non-breaking tier change** (§16). Zero-cost is the default, not a ceiling.

**Reconciled inconsistency 4 — "cache every Google response" vs Google ToS caching limits.**
Cache First is honored with **ToS-compliant TTLs**: Place IDs and geocoded coordinates stored long-term; other Place Content cached only within permitted windows; ratings/reviews/photos not warehoused. Durable product value lives in **our derived analysis + scores**, not stored Google Content (§7). Flagged for **legal review before launch**.

**Reconciled inconsistency 5 — "zero-cost" vs Vercel Hobby's non-commercial terms.**
The one honest cost is that **commercial launch requires Vercel Pro** (Hobby is for non-commercial use). Development, MVP, and demos run at zero cost; production commercial use moves to Pro with **no architectural change** (§18). This is surfaced rather than hidden.

**Obsolete concepts confirmed removed.** No background scanner, workers, queue, Redis, notification engine, cron, scheduled/daily/weekly/monthly scans, automatic discovery, continuous monitoring, cold email, WhatsApp/Instagram automation, proposal/meeting-script generation, AI sales automation, or autonomous agents appear anywhere in this design. Every action is user-triggered; AI only analyzes and reasons.

**Zero-Cost alignment check (section by section).**

- _Architecture (§2):_ single Next.js app, one Postgres, no paid infra. ✔
- _Database/Cache (§5–6):_ Postgres-only cache, no Redis, lazy read-through refresh. ✔
- _Google (§7):_ cache-first, field masks, manual discovery — minimizes calls; user's keys. ✔
- _Analysis (§9):_ HTTP-only, no headless browser — free and within function limits. ✔
- _AI (§11):_ optional, user-funded, cached to avoid re-billing. ✔
- _Rate limiting (§12–13):_ Postgres-backed, no Redis. ✔
- _Deployment (§15):_ free tiers throughout; provider PITR for backups. ✔

**Residual weaknesses to watch during build.**

- _Serverless time budget_ is the tightest real constraint — keep analysis and AI per-request work small; stream AI; never introduce a hidden long-running step.
- _No fixed egress IP_ weakens Google server-key restriction; rely on API-scoping and revisit if a static IP becomes affordable.
- _SPA analysis fidelity_ is limited without JS rendering; communicate confidence and keep headless rendering out of scope for cost.
- _Prompt injection and SSRF_ are the two security edges that deserve continuous attention because both ingest untrusted external content.
- _Free-tier auto-suspend_ (DB cold starts) can add first-request latency; the pooler and RSC caching mitigate perceived impact.

**Verdict.** Architecture v2 is internally consistent, faithful to all five core principles, and implementation-ready. Its strengths are radical simplicity (no asynchronous plane), a genuine Cache-First cost model, and a design that scales up by changing plans rather than rewriting. Its honest costs and risks — the Vercel commercial-plan requirement, serverless time limits, and Google/legal compliance — are surfaced with concrete mitigations. A senior team can build the entire application, sprint by sprint, from this document.

---

_End of Architecture v2. This document is the single source of truth for LeadMap._
