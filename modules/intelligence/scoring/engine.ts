import "server-only";

import type { ScoringExpression } from "@/lib/validation/scoring";

import type { ScoringContext } from "./context";
import { evaluateExpression } from "./expression";

/**
 * Lead Score engine (architecture.md §10.2's pseudocode, implemented
 * literally):
 *
 * ```
 * for rule in ruleset where enabled:
 *     matched  = evaluate(rule.expression, context)
 *     points   = matched ? min(rule.weight_contribution, rule.max_points) : 0
 *     breakdown.push({ key, matched, points, reason })
 * total = normalize(sum(points)) → 0..100
 * ```
 *
 * Pure: `computeLeadScore` takes its ruleset and context as plain data
 * and returns plain data — no I/O, no randomness, no wall-clock
 * dependency — so the same `(context, ruleset)` pair always produces
 * the same `LeadScoreResult` ("deterministic scoring"). Where the
 * ruleset/context come from (DB reads, the analyzer's output) is the
 * caller's concern (`rules-repository.ts`, `context.ts`), kept out of
 * this file entirely.
 */

/** A `scoring_rules` row, already validated/decoded — the shape
 * `getActiveRuleset` (`rules-repository.ts`) hands the engine. */
export type ScoringRule = {
  key: string;
  category: string;
  description: string;
  expression: ScoringExpression;
  weight: number;
  maxPoints: number;
};

/** The active `scoring_rulesets` row, with its `rule_keys` already
 * resolved to full, enabled-only rule rows, in `rule_keys` order. */
export type ActiveRuleset = {
  version: number;
  rules: ScoringRule[];
};

export type ScoreBreakdownEntry = {
  key: string;
  matched: boolean;
  points: number;
  reason: string;
};

export type LeadScoreResult = {
  total: number;
  breakdown: ScoreBreakdownEntry[];
  rulesetVersion: number;
};

/**
 * architecture.md §10.2: "total = normalize(sum(points)) → 0..100" —
 * the exact formula isn't specified beyond that goal, so this scales
 * the raw point sum proportionally against the maximum achievable sum
 * for the *currently active* ruleset (the sum of `max_points` across
 * its enabled rules), then clamps to 0..100. Proportional rather than a
 * fixed divisor keeps scores correctly in range regardless of how many
 * rules are enabled or how their individual `max_points` are set —
 * admins don't have to carefully make weights sum to exactly 100 for
 * `total` to land correctly.
 */
function normalize(rawTotal: number, maxPossible: number): number {
  if (maxPossible <= 0) return 0;
  const scaled = (rawTotal / maxPossible) * 100;
  return Math.max(0, Math.min(100, Math.round(scaled)));
}

export function computeLeadScore(
  context: ScoringContext,
  ruleset: ActiveRuleset,
): LeadScoreResult {
  const breakdown: ScoreBreakdownEntry[] = [];
  let rawTotal = 0;
  let maxPossible = 0;

  for (const rule of ruleset.rules) {
    const matched = evaluateExpression(rule.expression, context) === true;
    const points = matched ? Math.min(rule.weight, rule.maxPoints) : 0;

    breakdown.push({
      key: rule.key,
      matched,
      points,
      reason: rule.description,
    });

    rawTotal += points;
    maxPossible += rule.maxPoints;
  }

  return {
    total: normalize(rawTotal, maxPossible),
    breakdown,
    rulesetVersion: ruleset.version,
  };
}
