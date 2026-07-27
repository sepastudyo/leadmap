import { z } from "zod";

/**
 * The Lead Score rule expression DSL (architecture.md §10.1 "a
 * serialized, sandboxed boolean/DSL condition (e.g., a JSON-Logic-style
 * tree)" / §10.3 "sandboxed evaluator with an allow-listed operator
 * set (no arbitrary code execution)"). This schema *is* the allow-list:
 * a `scoring_rules.expression` jsonb value is only ever treated as
 * well-formed if it matches one of the shapes below — anything else
 * (an unknown operator key, extra properties, wrong arity) fails
 * validation before `modules/intelligence/scoring/expression.ts` ever
 * evaluates it, the same "validate at every boundary" discipline
 * (architecture.md §13.3) applied everywhere else in this app.
 */

export type ScoringExpression =
  | string
  | number
  | boolean
  | null
  | { var: string }
  | { "==": [ScoringExpression, ScoringExpression] }
  | { "!=": [ScoringExpression, ScoringExpression] }
  | { ">": [ScoringExpression, ScoringExpression] }
  | { ">=": [ScoringExpression, ScoringExpression] }
  | { "<": [ScoringExpression, ScoringExpression] }
  | { "<=": [ScoringExpression, ScoringExpression] }
  | { and: ScoringExpression[] }
  | { or: ScoringExpression[] }
  | { not: [ScoringExpression] };

export const scoringExpressionSchema: z.ZodType<ScoringExpression> = z.lazy(
  () =>
    z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.null(),
      z.strictObject({ var: z.string() }),
      z.strictObject({
        "==": z.tuple([scoringExpressionSchema, scoringExpressionSchema]),
      }),
      z.strictObject({
        "!=": z.tuple([scoringExpressionSchema, scoringExpressionSchema]),
      }),
      z.strictObject({
        ">": z.tuple([scoringExpressionSchema, scoringExpressionSchema]),
      }),
      z.strictObject({
        ">=": z.tuple([scoringExpressionSchema, scoringExpressionSchema]),
      }),
      z.strictObject({
        "<": z.tuple([scoringExpressionSchema, scoringExpressionSchema]),
      }),
      z.strictObject({
        "<=": z.tuple([scoringExpressionSchema, scoringExpressionSchema]),
      }),
      z.strictObject({ and: z.array(scoringExpressionSchema).min(1) }),
      z.strictObject({ or: z.array(scoringExpressionSchema).min(1) }),
      z.strictObject({ not: z.tuple([scoringExpressionSchema]) }),
    ]),
);
