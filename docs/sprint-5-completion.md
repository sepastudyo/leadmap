# Sprint 5 Completion Report — AI Intelligence (optional)

**Status:** Complete, tagged `sprint-5-complete` (commit `0b790c9`).
**Source of truth:** [architecture.md](./architecture.md) §11, §17.

---

## Sprint objectives

- Implement provider-agnostic AI adapters (OpenAI, Gemini, Claude) behind a single interface, per §11.
- Implement the only two allowed AI features: AI Audit and Opportunity Reasoning — no outreach/message generation of any kind.
- Implement structured-output validation, caching by input hash, and graceful degradation when AI is unavailable or no key is stored.
- Implement prompt-injection hygiene for website-derived content.

**Working app milestone:** with a key, get AI Audit + Opportunity Reasoning; without a key, the app is fully functional.

---

## Delivered features

### Phase 5.1 — Provider adapter foundation

- `generateStructured` (`modules/ai/generate-structured.ts`) — the one interface every AI call goes through: Zod-validated output, one repair retry on invalid content, transient-error retry via the AI SDK's own `maxRetries`, bounded by `AI_REQUEST_TIMEOUT_MS`.
- `resolveModel` (`modules/ai/providers.ts`) — the only code touching `@ai-sdk/openai`/`@ai-sdk/google`/`@ai-sdk/anthropic` directly; always takes the caller's decrypted key (BYOK, no env-var fallback).
- `ai_results` schema + repository — `getCachedAiResult`/`storeAiResult`, `DbClient`-optional, matching every other repository in the codebase.

### Phase 5.2 — AI Audit

- Structured critique (strengths/weaknesses/gaps) from stored business facts + website analysis.
- Cache-first: `input_hash` computed from business facts + analysis content hash + prompt version, checked before any provider call.
- `POST /api/businesses/{id}/ai/audit`, `AiAuditPanel` on the Business Detail Page — explicitly user-triggered, never automatic.

### Phase 5.3 — Opportunity Reasoning

- Structured promising/not-promising verdict + reasons, adding Lead Score breakdown to Audit's inputs.
- Same cache-first shape as Audit; `LeadScoreUnavailableError` for the one new prerequisite (a published scoring ruleset).
- `POST /api/businesses/{id}/ai/opportunity`, `OpportunityPanel`, structurally mirroring `AiAuditPanel`.

### Phase 5.4 — Live AI key validation in Settings

- `validateAiProviderKey` — the smallest possible `generateStructured` call (`{ok: boolean}` schema) to confirm a key authenticates, the model is reachable, and structured generation round-trips, without persisting anything.
- Wired into `saveSettings`: a fresh AI key is validated before encryption/persistence; failure throws `AiApiKeyInvalidError` (generic message, no provider detail leaked).

### Phase 5.5 — Gate AI features on key presence

- Found and fixed a literal non-compliance with architecture.md §11's unconditional "AI features appear only when the user has stored a valid provider key" — the Business Detail Page now reads `getMaskedSettings` and only renders `AiAuditPanel`/`OpportunityPanel` when a key is configured, showing a single Settings-linking notice otherwise.

### Final Review

- Full line-by-line re-verification of cache-first behavior, BYOK, ownership scoping, repository pattern, no API bypasses, no unnecessary provider calls, no Sprint 6 scope creep, no unfinished TODOs. No code changes required.

---

## Architecture decisions

1. **Vercel AI SDK over hand-rolled provider clients.** architecture.md §19 allows either; the AI SDK's `generateObject` maps directly onto "structured output validated with Zod," and its unified `LanguageModel` type made a genuine one-interface adapter (`generateStructured`) straightforward.
2. **`exceljs`-style dependency diligence extended to the AI SDK.** Checked `npm audit` on `ai` + all three `@ai-sdk/*` packages before installing — clean, no findings.
3. **`modules/settings` imports `@/modules/ai/validate-key` by direct file path, not the `@/modules/ai` barrel.** `modules/ai/audit.ts`/`opportunity.ts` already import `getDecryptedKeys` from `modules/settings`; importing the barrel from settings would create a real circular module dependency (`settings → ai barrel → audit.ts → settings`). Bypassing the barrel for this one import breaks the cycle at the file-dependency level. Documented in both files.
4. **Repair-retry and transient-error-retry are two distinct mechanisms**, per §11.3's own wording: `AI_STRUCTURED_OUTPUT_MAX_REPAIR_ATTEMPTS` (1) handles invalid _content_ (re-prompts the model); `AI_TRANSIENT_ERROR_MAX_RETRIES` (1, passed as the AI SDK's own `maxRetries`) handles transport failures. Kept separate rather than conflated into one retry count.
5. **Audit and Opportunity are independent, structurally symmetric orchestration files, not a shared abstraction.** A real shared skeleton (key check → business → analysis → [score] → hash → cache check → generate → persist) does exist between them, but extracting it was explicitly deferred each phase to avoid modifying already-approved prior-phase code for a non-bug reason.

---

## Deferred items

Disclosed at the time, not fixed, and still open:

- **Streaming** (§11.3, explicitly hedged "(where supported)"). Not implemented — AI Audit/Opportunity Reasoning are small, bounded structured-output calls well within the timeout without it; implementing it now would require reworking `generateStructured`, both routes' response shape, and both panels' fetch handling.
- **A formal "prompt registry" module.** Judged already satisfied by each feature's own versioned prompt constant + function (§11.4's actual requirement — "versioned named templates, not scattered literals"); a separate registry abstraction would either sit unused or require refactoring Audit/Opportunity to route through it.
- **`favoriteId`/`id` field-naming inconsistency** across `/api/favorites`'s verbs (Sprint 4, still open).
- **`search_cache`/"recent searches" architecture.md wording inconsistency** (Sprint 4, still open — a documentation fix, not a schema change).

---

## Health notes

- Two Medium findings from the pre-Sprint-4 health review were resolved in Sprint 4 (`#6` shared HTTP helpers, `#10` central soft-delete helper) — unrelated to Sprint 5 but noted for continuity; see `docs/project-health-review.md`.
- No new entries were added to that health review during Sprint 5; the findings below are new, Sprint-5-specific observations instead.

---

## Known technical debt

1. **`BusinessFacts` type + its construction is duplicated verbatim** between `modules/ai/audit.ts` and `modules/ai/opportunity.ts` (7 fields, identical shape). Disclosed since Phase 5.3; not extracted, per the "don't modify Audit unless a bug" constraint each subsequent phase carried forward.
2. **Stale doc comment** in `db/schema/ai-results.ts`: says the `output` jsonb column isn't `.$type<>()`-annotated because "the AI Audit and Opportunity Reasoning output shapes don't exist yet" — they do now (Phase 5.2/5.3). Worth a comment fix and a real decision on typing the column (likely a union of both output types) in a future pass.
3. **Unconfirmed, low-severity observation**: `captureException` on a generation failure logs whatever error text the provider's SDK returned, which _could_ theoretically include partially-redacted key material if a provider's own API echoes it back in an error message. This matches an existing, pre-Sprint-5 pattern elsewhere in the codebase (e.g. `guarded-fetch.ts`), not a new regression — flagged because it specifically involves credentials.
4. **Live-path verification gap** (carried from every prior sprint): no live Postgres or real provider API key was available in this sandbox at any point in Sprint 5. Every cache-first flow, the live key-validation call, and the panel-gating logic are typecheck/review-verified only.

---

## Manual verification checklist (before Sprint 6)

- [ ] Real database pass: apply migration `0008_sprint5_ai_results.sql`; confirm the `ai_results` unique constraint `(user_id, business_id, type, input_hash)` behaves as an upsert, not a duplicate-row error, on a repeat identical request.
- [ ] With a real OpenAI/Gemini/Claude key saved in Settings: confirm the save succeeds only when the key actually works, and fails with the generic `AiApiKeyInvalidError` message (not a raw provider error) when it doesn't.
- [ ] Run AI Audit twice in a row on the same business with no changes in between — confirm the second call is a cache hit (no new provider request, verify via provider dashboard usage if possible) and returns identical output.
- [ ] Change the business's website content (or re-run analysis) and confirm AI Audit regenerates (new `input_hash`, not a stale cache hit).
- [ ] Run Opportunity Reasoning on a business with no published scoring ruleset — confirm the "no Lead Score" notice appears, not a raw error.
- [ ] Remove the AI key in Settings and reload a Business Detail Page that was open before removal — confirm the AI panels disappear (or, if already rendered client-side before reload, that clicking still degrades gracefully to the "key missing" message).
- [ ] Confirm neither AI Audit nor Opportunity Reasoning ever produces outreach-shaped content (emails, messages, proposals) even under adversarial prompting from a crafted website's meta tags/title — a live test of the prompt-injection hygiene in §11.4.
- [ ] Visual/browser verification of all new UI (AiAuditPanel, OpportunityPanel, the Settings error states, the Business Detail Page's key-gating notice) — not done in this sandbox per standing instruction against browser automation.
