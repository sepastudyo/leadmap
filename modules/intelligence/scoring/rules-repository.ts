import "server-only";
import { desc, eq, inArray } from "drizzle-orm";

import { leadScores, scoringRules, scoringRulesets } from "@/db/schema";
import { db, type DbClient } from "@/lib/db";
import { scoringExpressionSchema } from "@/lib/validation/scoring";

import type { ActiveRuleset, LeadScoreResult, ScoringRule } from "./engine";

/**
 * Reads the currently active ruleset (architecture.md §10.2 "ruleset =
 * active ruleset (cached in memory; invalidated on publish)", §10.3
 * "the engine reads the active ruleset from the DB"). In-memory caching
 * across requests is **not** implemented in this phase — there's no
 * publish/admin surface yet (out of this phase's scope) for a cache to
 * be invalidated against, so a cache here would have no correct
 * invalidation trigger. This is a direct, uncached read; adding the
 * cache is a documented, deferred optimization once publishing exists,
 * not a correctness gap today (see docs/sprint-3.md).
 *
 * Rules are resolved in `rule_keys`'s own order (not DB insertion
 * order — `scoring_rulesets *─* scoring_rules` is a logical
 * relationship via that array, per architecture.md §5.3) and filtered
 * to `enabled: true`, matching §10.2's "for rule in ruleset where
 * enabled". Each `expression` is parsed through
 * `scoringExpressionSchema` before the engine ever sees it — the same
 * allow-list enforcement point as every other jsonb-sourced boundary in
 * this app. Returns `null` if no ruleset has been published yet.
 */
export async function getActiveRuleset(
  dbClient: DbClient = db,
): Promise<ActiveRuleset | null> {
  const [ruleset] = await dbClient
    .select()
    .from(scoringRulesets)
    .where(eq(scoringRulesets.isActive, true))
    .orderBy(desc(scoringRulesets.version))
    .limit(1);

  if (!ruleset) return null;

  if (ruleset.ruleKeys.length === 0) {
    return { version: ruleset.version, rules: [] };
  }

  const rows = await dbClient
    .select()
    .from(scoringRules)
    .where(inArray(scoringRules.key, ruleset.ruleKeys));

  const byKey = new Map(rows.map((row) => [row.key, row]));

  const rules: ScoringRule[] = ruleset.ruleKeys
    .map((key) => byKey.get(key))
    .filter(
      (row): row is (typeof rows)[number] => row !== undefined && row.enabled,
    )
    .map((row) => ({
      key: row.key,
      category: row.category,
      description: row.description,
      expression: scoringExpressionSchema.parse(row.expression),
      weight: row.weight,
      maxPoints: row.maxPoints,
    }));

  return { version: ruleset.version, rules };
}

/**
 * `businesses 1─1 lead_scores` (architecture.md §5.3) — upsert keyed on
 * `business_id`, the same upsert-on-unique-key shape as
 * `businesses-repository.ts`'s `upsertBusinesses`.
 */
export async function upsertLeadScore(
  businessId: string,
  result: LeadScoreResult,
  dbClient: DbClient = db,
) {
  const [row] = await dbClient
    .insert(leadScores)
    .values({
      businessId,
      total: result.total,
      breakdown: result.breakdown,
      rulesetVersion: result.rulesetVersion,
    })
    .onConflictDoUpdate({
      target: leadScores.businessId,
      set: {
        total: result.total,
        breakdown: result.breakdown,
        rulesetVersion: result.rulesetVersion,
        computedAt: new Date(),
      },
    })
    .returning();

  return row;
}
