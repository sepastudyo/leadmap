# Sprint 4 — Lead Organization (Lightweight CRM)

Source of truth: [architecture.md](./architecture.md) §17.

## Objectives

- Implement the personal lead organizer: favorites, status, priority, follow-up date, and notes — explicitly not an outreach/automation CRM (§3, §20).
- Surface follow-ups due on the dashboard as a pull-based query, with no notifications or scheduled jobs.
- Implement bounded, streamed export to CSV/XLSX.
- Implement soft deletes for user-plane records.

## Deliverables

- `favorites` table and UI: save/unsave a business, set status (New/Reviewing/Qualified/Not a fit/Won), priority, `follow_up_at`.
- `notes` table and UI: attach/edit notes to a business, pin/unpin.
- Dashboard "follow-ups due today" section (pull-based query against `favorites.follow_up_at <= today`).
- Export endpoint (`/api/export`): streamed CSV/XLSX of selected leads, bounded size.
- Soft deletes (`deleted_at`) on `favorites` and `notes`, filtered centrally in `lib/db`.

**Working app milestone:** save, annotate, status-track, set follow-ups, and export leads.

## Progress

Sprint 4 was built in phases, same pattern as Sprint 2/3 (see
docs/sprint-2.md, docs/sprint-3.md) — each phase's own scope tracked
here rather than jumping straight to the sprint-level deliverables.
Preceded by a [Project Health Review](./project-health-review.md)
(2026-07-27) whose Critical/High findings were fixed first; two of its
deferred Medium findings (#6 shared HTTP helpers, #10 central
soft-delete helper) were folded into this sprint since they directly
supported it.

### Phase 4.1 — Schema, soft-delete helper, repository layer

- [x] `favorites` and `notes` tables (migration
      `0007_sprint4_favorites_notes.sql`), matching architecture.md
      §5.2 column-for-column plus the §5.4 index set. `favorites`'
      `unique (user_id, business_id)` is a _partial_ unique index
      (`WHERE deleted_at IS NULL`) rather than a flat constraint — a
      flat constraint would make "unsave" permanent, since a later
      re-save would collide with the old soft-deleted row (documented
      in `db/schema/favorites.ts`).
- [x] Central soft-delete helper: `notDeleted()` in `lib/db/index.ts`
      (health review finding #10), retrofitted onto
      `modules/auth/users.ts`'s `findUserByEmail`.
- [x] Repositories (`modules/crm/favorites-repository.ts`,
      `notes-repository.ts`) and orchestration (`favorites.ts`,
      `notes.ts`) — `DbClient`-optional, every query scoped to
      `(userId, notDeleted(...))`, matching the Sprint 2/3 repository
      pattern. No Route Handler or UI yet, per the established
      "orchestration before HTTP surface" split.

**Verification:** `npm run format/lint`, `tsc --noEmit`, `npm run
build` all passed. No live Postgres in this sandbox throughout Sprint
4 — every phase's repository/query behavior is typecheck/review-
verified only, restated once here rather than in each phase below.

### Phase 4.2 — API surface: favorites + notes routes

- [x] `GET/POST /api/favorites`, `PATCH/DELETE /api/favorites/{id}`,
      `POST /api/businesses/{id}/notes`, `PATCH/DELETE /api/notes/{id}`.
      The empty Sprint-1 scaffold `app/api/business/` was renamed to
      `app/api/businesses/` (plural, matching §12.1/§12.5's literal
      endpoint paths over §4's folder-sketch spelling) to hold the
      first of these.
- [x] Shared HTTP helpers: `lib/http/index.ts` (`requireSession`,
      `jsonData`, `jsonError`) — health review finding #6, closed by
      retrofitting all 3 pre-existing routes (`discovery/search`,
      `settings`, `discovery/maps-key`) as well as every new route.
- [x] Validation: `lib/validation/crm.ts`.
- [x] New orchestration needed for the API surface: `favoriteBusiness` + `FavoriteAlreadyExistsError` (create-only, 409 on duplicate,
      distinct from Phase 4.1's toggle-style `toggleFavorite`), and a
      shared `BusinessNotFoundError` (`modules/crm/errors.ts`) used by
      both `favoriteBusiness` and `addNote` to 404 a client-supplied
      `businessId` before it can hit a bare FK violation.

**Verification:** same battery, plus HTTP-smoke-tested: all 6
new/retrofitted endpoints correctly return `401` unauthenticated.

### Phase 4.3 — Business Detail Page CRM UI

- [x] `components/business/favorite-panel.tsx` (toggle save/unsave,
      status select, priority input, follow-up date input) and
      `notes-panel.tsx` (list, add, edit, pin/unpin) — both thin
      clients over the Phase 4.2 API, wired into
      `app/(dashboard)/business/[id]/page.tsx`, which reads the
      current favorite/notes directly through the repository/
      orchestration layer (the same pattern the page already used for
      Place Details/analysis/score).
- [x] Deviation: Priority is a plain integer input, not a fixed set of
      levels — architecture.md defines it only as `nullable int`, no
      scale/labels specified anywhere.
- [x] Deviation: the favorite toggle is built from separate `POST`
      (create) / `DELETE` (unsave) calls rather than one toggle
      endpoint — more RESTful, matches §12.5's literal "List / create"
      wording; `toggleFavorite` (Phase 4.1) is left unused as a result.
- [x] Post-approval fix: `favorite-panel.tsx` had redeclared its own
      `FavoriteStatus` union instead of importing the canonical one
      from `modules/crm` — fixed via a type-only import (erased at
      compile time, confirmed against this codebase's existing
      `analysis-summary.tsx`/`lead-score-card.tsx` precedent).

**Verification:** same battery, plus smoke-tested: `/business/[id]`
unauthenticated still redirects to `/sign-in` (no regression).

### Phase 4.4 — Leads page

- [x] `/leads` (`app/(dashboard)/leads/page.tsx` + `components/leads/`)
      — RSC loads the first page via `getLeadsForUser`; `LeadsView`
      (client) owns pagination, sorting, status filtering, and row
      selection. Reuses `DataTable`/`DataTablePagination` exactly as
      Sprint 2 Phase 2.3 generalized them for this moment. Columns:
      Business Name, Status, Priority, Follow-up Date, Lead Score.
- [x] Nav link added to `app/(dashboard)/layout.tsx` (the shared shell,
      not the Dashboard page) so `/leads` is reachable.
- [x] Deviation (flagged and approved): `GET /api/favorites` — which had
      zero real callers before this phase — was enriched to return
      each favorite joined with its business name and Lead Score
      (`listLeadsByUser`/`getLeadsForUser`, new in
      `modules/crm/favorites-repository.ts`/`favorites.ts`), since
      neither field lives on `favorites` itself and the Leads page's
      required columns need both. Additive only — no other verb on
      this resource changed. Known follow-up, not yet applied: `GET`'s
      response keys the row `favoriteId`, while `POST`/`PATCH` key the
      same row `id` — a naming inconsistency across verbs on one
      resource, identified but deliberately left for a future decision.

**Verification:** same battery, plus smoke-tested: `/leads`
unauthenticated redirects; `GET /api/favorites` unauthenticated `401`s.

### Phase 4.5 — Dashboard real queries

- [x] New `listDueFollowUpsByUser`/`getDueFollowUpsForUser` in
      `modules/crm` (favorites joined with business name, filtered
      `follow_up_at <= today`, server UTC). `app/(dashboard)/page.tsx`'s
      "Saved leads" and "Follow-ups due" cards replaced with real
      queries through this same repository/orchestration layer.
- [x] **Architecture issue found and reported, not silently worked
      around:** architecture.md §3 describes "recent searches (from
      `search_cache` owned by the user)", but §5.1/§5.2/§6.3 define
      `search_cache` as the GLOBAL, deduplicated shared cache plane
      with no `user_id` column — confirmed against
      `db/schema/search-cache.ts`. This is an inconsistency inside
      architecture.md itself (present since the original v2 document),
      not a Sprint 4 gap. Verified: (1) `search_cache` is intentionally
      shared — five independent sections say so; (2) adding `user_id`
      either breaks Cache-First's dedup guarantee (if part of the
      row's identity) or can't correctly represent multi-user history
      (if a bolt-on attribution column); (3) the "owned by the user"
      wording is the one inconsistent outlier. Recommended fix: correct
      §3's wording to match the shared-cache design (smallest
      correction) rather than add a `search_history` table or modify
      `search_cache` (larger corrections, not adopted). Per your
      instruction, "Recent searches" is left as an accurate placeholder
      and the wording fix is deferred to you.

**Verification:** same battery, plus smoke-tested: `/` unauthenticated
redirects.

### Phase 4.6 — Export

- [x] `GET /api/export` (`app/api/export/route.ts`) — streamed CSV/XLSX
      of the Leads page's existing row selection, bounded to
      `EXPORT_MAX_ROWS` (500, `config/constants.ts`). New
      `listLeadsByIds`/`getLeadsByIds` in `modules/crm`, scoped to
      `(userId, notDeleted)` — a manipulated id for another user's
      favorite is silently dropped rather than erroring in a way that
      would confirm it exists.
- [x] **Dependency issue found and reported before implementing:**
      architecture.md §19 recommends `xlsx` (SheetJS), but every
      version on the public npm registry — including the latest,
      `0.18.5` — carries two direct, unpatched advisories (prototype
      pollution, ReDoS), with no fixed version published to the
      registry. Investigated `exceljs` as an alternative: one indirect,
      moderate advisory (via `uuid`, through `archiver`, only
      triggered by a usage pattern `exceljs`'s own code doesn't
      exercise) — meaningfully lower risk, plus a genuine streaming
      XLSX writer. Approved and adopted; treated as an implementation
      refinement, not an architecture deviation, per instruction.
      Verified the actual byte output (not just typecheck) by running
      the exact stream-bridging code standalone: well-formed CSV rows,
      and XLSX bytes starting `504b0304` (the ZIP magic number),
      confirming a genuine valid XLSX through the code path the route
      uses.
- [x] Dedup: pulled the favorite-status label mapping (duplicated
      across `columns.tsx` and about to be duplicated a third time in
      the export route) into a shared, framework-free
      `components/leads/status-labels.ts`.

**Verification:** same battery, plus smoke-tested: `GET /api/export`
unauthenticated `401`s.

## Sprint 4 — Final status: complete

Accepted complete 2026-07-27, tagged `sprint-4-complete`.

Every deliverable in this document's own list and in architecture.md
§3/§17's Sprint 4 line is implemented: `favorites` (save/unsave,
status, priority, follow-up date) and `notes` (attach/edit/pin) with
UI on the Business Detail Page; a Leads list page (filter/sort/
paginate/select) that the Export deliverable's "selected leads"
implicitly required; a real, query-driven Dashboard follow-ups-due
section; a bounded, streamed CSV/XLSX export; and soft deletes filtered
centrally via `lib/db`'s `notDeleted()` helper, confirmed (Phase 4.7)
to be the _only_ code path touching either table (`grep` found no
other `.from(favorites)`/`.from(notes)` query anywhere in the
codebase), with every read/update/soft-delete query in both
repositories filtering it — none omitted.

Two items were surfaced during the sprint rather than fixed
unilaterally, both still open for your decision: the `search_cache`
"recent searches" wording inconsistency (Phase 4.5), and the
`favoriteId`/`id` field-naming inconsistency across `/api/favorites`'
verbs (Phase 4.4, noted in the architecture-question exchange after
that phase).

## Manual verification recommended before Sprint 5

Consolidated from every phase above — nothing beyond typecheck/lint/
build/HTTP-smoke-testing has been verified in this sandbox (no live
Postgres, no browser per standing instruction):

- Real database pass: migration `0007_sprint4_favorites_notes.sql`
  applies cleanly; the partial unique index on `favorites` actually
  allows save → unsave → re-save; the joined `listLeadsByUser`/
  `listLeadsByIds`/`listDueFollowUpsByUser` queries return correct
  results against real `businesses`/`lead_scores` rows (including the
  `LEFT JOIN` correctly producing `null` when no score exists yet).
- Manual click-through: favorite toggle, status/priority/follow-up
  editing, notes add/edit/pin/unpin on the Business Detail Page;
  Leads page pagination, sorting, status filter, and row selection
  across a page boundary (selection is expected to reset — confirm
  that's the actual behavior, not just the intent); Dashboard's
  Saved-leads count and Follow-ups-due list against real data.
- Real file download: click "Export CSV" / "Export XLSX" from a
  browser and confirm both files open correctly in real
  spreadsheet software (Excel/Google Sheets/Numbers), not just that
  the byte stream was well-formed in isolation (as verified in Phase
  4.6).
- Timezone check: a follow-up date right at a UTC day boundary — confirm
  whether "due today" matches user expectation for non-UTC timezones
  (known limitation, no per-user timezone exists anywhere in this
  app's schema).
- Concurrent-edit check: two browser tabs editing the same favorite's
  status/priority — confirm last-write-wins is acceptable (no
  optimistic-concurrency control exists on `favorites`/`notes`, matching
  every other table in this app).
