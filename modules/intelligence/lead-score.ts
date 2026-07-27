import "server-only";

import {
  buildScoringContext,
  computeLeadScore,
  getActiveRuleset,
  upsertLeadScore,
  type ScoringBusinessInput,
} from "./scoring";
import type { AssembledAnalysis } from "./analysis";

/**
 * Lead Score orchestration (architecture.md §6.1 "Lead score |
 * lead_scores | Recomputed when analysis or ruleset changes | Derived;
 * cheap to recompute"). Unlike Place Details/Website Analysis, there's
 * no TTL here — scoring is a pure, in-memory, O(rules) computation
 * (§10.3 "trivially cheap, even across large result sets"), so this
 * always recomputes from the *current* business + analysis + active
 * ruleset and persists the result, rather than serving a possibly-stale
 * cached score. That's the correct behavior for "recomputed when
 * analysis or ruleset changes" without needing explicit
 * change-detection wiring: recomputing on every call is equivalent to
 * perfect invalidation, since there's nothing expensive being saved by
 * skipping it.
 *
 * `null` if no ruleset has been published yet (`db/seed/index.ts` seeds
 * one, but this stays defensive rather than assuming seed data exists).
 */
export async function getOrComputeLeadScore(
  businessId: string,
  business: ScoringBusinessInput,
  analysis: AssembledAnalysis | null,
) {
  const ruleset = await getActiveRuleset();
  if (!ruleset) return null;

  const context = buildScoringContext(business, analysis);
  const result = computeLeadScore(context, ruleset);

  return upsertLeadScore(businessId, result);
}
