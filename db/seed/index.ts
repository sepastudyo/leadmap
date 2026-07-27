import "server-only";
import { sql } from "drizzle-orm";

import { scoringRules, scoringRulesets } from "@/db/schema";
import { db, type DbClient } from "@/lib/db";
import type { ScoringExpression } from "@/lib/validation/scoring";

/**
 * Seed data: the default Lead Score ruleset (architecture.md §5.2
 * `scoring_rulesets`, §10.3 "New rules are inserted as data (admin form
 * or seed migration)"). Sprint 3 Phase 3.5's first (and, until an admin
 * publish surface exists in a later phase, only) ruleset.
 *
 * Built from exactly the fields architecture.md §10.1 names as its own
 * scoring-context example — `has_ssl, has_website, cms, has_ga4,
 * has_meta_pixel, seo.title_ok, seo.h1_ok, has_sitemap, schema_present,
 * social.count, google.rating, google.review_count` — one rule per
 * field, nothing invented beyond them ("no heuristics outside
 * architecture.md"). `social_presence` (added post-Phase-3.5, once the
 * Website Analyzer's [7 Social] stage closed that gap — see
 * docs/sprint-3.md) was the last field to gain a rule; every other rule
 * had its `weight`/`max_points` reduced by 1 at the same time so the
 * ruleset's total stays exactly 100 — still just a legible default,
 * never a requirement `computeLeadScore`'s proportional normalization
 * depends on.
 */

export type SeedRule = {
  key: string;
  name: string;
  description: string;
  category: string;
  expression: ScoringExpression;
  weight: number;
  maxPoints: number;
};

export const DEFAULT_RULESET_VERSION = 1;

/** Exported (not just module-internal) so the seed data itself is
 * directly inspectable/testable — e.g. verifying every expression
 * parses against `scoringExpressionSchema` and that weights sum to a
 * sane total — without needing a live database. */
export const DEFAULT_RULES: SeedRule[] = [
  {
    key: "has_ssl",
    name: "Uses HTTPS",
    description: "Site is served over HTTPS",
    category: "security",
    expression: { "==": [{ var: "has_ssl" }, true] },
    weight: 9,
    maxPoints: 9,
  },
  {
    key: "has_website",
    name: "Has a website",
    description: "Business has a website on file",
    category: "presence",
    expression: { "==": [{ var: "has_website" }, true] },
    weight: 5,
    maxPoints: 5,
  },
  {
    key: "has_cms",
    name: "Uses a recognized CMS",
    description: "Site runs on a recognized CMS platform",
    category: "technology",
    expression: { "!=": [{ var: "cms" }, null] },
    weight: 4,
    maxPoints: 4,
  },
  {
    key: "has_ga4",
    name: "Uses Google Analytics (GA4)",
    description: "Site has Google Analytics (GA4) installed",
    category: "tracking",
    expression: { "==": [{ var: "has_ga4" }, true] },
    weight: 7,
    maxPoints: 7,
  },
  {
    key: "has_meta_pixel",
    name: "Uses Meta Pixel",
    description: "Site has the Meta Pixel installed",
    category: "tracking",
    expression: { "==": [{ var: "has_meta_pixel" }, true] },
    weight: 6,
    maxPoints: 6,
  },
  {
    key: "seo_title_ok",
    name: "SEO title tag quality",
    description: "Title tag is present and within the recommended length",
    category: "seo",
    expression: { "==": [{ var: "seo.title_ok" }, true] },
    weight: 9,
    maxPoints: 9,
  },
  {
    key: "seo_h1_ok",
    name: "Single H1 heading",
    description: "Page has exactly one H1 heading",
    category: "seo",
    expression: { "==": [{ var: "seo.h1_ok" }, true] },
    weight: 7,
    maxPoints: 7,
  },
  {
    key: "has_sitemap",
    name: "Has a sitemap.xml",
    description: "Site publishes a discoverable sitemap.xml",
    category: "seo",
    expression: { "==": [{ var: "has_sitemap" }, true] },
    weight: 6,
    maxPoints: 6,
  },
  {
    key: "schema_present",
    name: "Has structured data",
    description:
      "Site includes Schema.org structured data (JSON-LD, Microdata, or RDFa)",
    category: "seo",
    expression: { "==": [{ var: "schema_present" }, true] },
    weight: 7,
    maxPoints: 7,
  },
  {
    key: "social_presence",
    name: "Has a social media presence",
    description: "Site links to at least one major social platform",
    category: "social",
    expression: { ">=": [{ var: "social.count" }, 1] },
    weight: 10,
    maxPoints: 10,
  },
  {
    key: "google_rating_strong",
    name: "Strong Google rating",
    description: "Google rating is 4.0 or higher",
    category: "reputation",
    expression: { ">=": [{ var: "google.rating" }, 4] },
    weight: 14,
    maxPoints: 14,
  },
  {
    key: "google_reviews_established",
    name: "Established review count",
    description: "Has 10 or more Google reviews",
    category: "reputation",
    expression: { ">=": [{ var: "google.review_count" }, 10] },
    weight: 16,
    maxPoints: 16,
  },
];

/**
 * Idempotent — upserts every rule by its unique `key` and the ruleset
 * by its unique `version`, so re-running this (e.g. after editing a
 * seed rule's description) is always safe. Marks the seeded ruleset
 * `is_active: true` unconditionally: today this is the only ruleset
 * that will ever exist (no publish/admin surface yet — a later phase's
 * job), so there's no other active version to conflict with. A future
 * publish flow adding ruleset version 2+ will need its own logic to
 * deactivate the previously active version; that's out of this
 * function's scope.
 */
export async function seedDefaultScoringRuleset(
  dbClient: DbClient = db,
): Promise<void> {
  await dbClient
    .insert(scoringRules)
    .values(
      DEFAULT_RULES.map((rule) => ({
        key: rule.key,
        name: rule.name,
        description: rule.description,
        category: rule.category,
        expression: rule.expression,
        weight: rule.weight,
        maxPoints: rule.maxPoints,
        enabled: true,
        version: 1,
      })),
    )
    .onConflictDoUpdate({
      target: scoringRules.key,
      set: {
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        category: sql`excluded.category`,
        expression: sql`excluded.expression`,
        weight: sql`excluded.weight`,
        maxPoints: sql`excluded.max_points`,
        enabled: sql`excluded.enabled`,
        updatedAt: new Date(),
      },
    });

  await dbClient
    .insert(scoringRulesets)
    .values({
      version: DEFAULT_RULESET_VERSION,
      label: "Default Lead Score Ruleset v1",
      ruleKeys: DEFAULT_RULES.map((rule) => rule.key),
      isActive: true,
    })
    .onConflictDoUpdate({
      target: scoringRulesets.version,
      set: {
        label: sql`excluded.label`,
        ruleKeys: sql`excluded.rule_keys`,
        isActive: sql`excluded.is_active`,
      },
    });
}
