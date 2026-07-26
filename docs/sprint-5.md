# Sprint 5 — AI Intelligence (optional)

Source of truth: [architecture.md](./architecture.md) §17.

## Objectives

- Implement provider-agnostic AI adapters (OpenAI, Gemini, Claude) behind a single interface, per §11.
- Implement the only two allowed AI features: AI Audit and Opportunity Reasoning — no outreach/message generation of any kind.
- Implement structured-output validation, caching by input hash, and graceful degradation when AI is unavailable or no key is stored.
- Implement prompt-injection hygiene for website-derived content.

## Deliverables

- `modules/ai` provider adapters implementing a common `generateStructured` interface for OpenAI/Gemini/Claude.
- Per-provider key validation in Settings (§7.2 pattern extended to AI keys).
- AI Audit feature: structured critique of a business's digital presence from stored analysis.
- Opportunity Reasoning feature: structured explanation of sales-opportunity fit from score + analysis + Google signals.
- Zod-validated structured output with one repair retry; graceful "AI unavailable" state on hard failure.
- `ai_results` caching keyed by `(user, business, type, input_hash)` to avoid re-billing the user's key.
- Prompt registry with versioned (`prompt_version`) templates; website-derived text treated as delimited, untrusted data.
- Graceful "no key" state so the app remains fully functional without AI.

**Working app milestone:** with a key, get AI Audit + Opportunity Reasoning; without a key, the app is fully functional.

## Progress

- [ ] Not started.
