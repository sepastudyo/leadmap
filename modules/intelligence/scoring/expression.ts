import "server-only";

import type { ScoringExpression } from "@/lib/validation/scoring";

/**
 * The sandboxed evaluator (architecture.md §10.1 "a serialized,
 * sandboxed boolean/DSL condition" / §10.3 "sandboxed evaluator with an
 * allow-listed operator set (no arbitrary code execution)"). No `eval`,
 * no `new Function`, no dynamic property access beyond a fixed
 * dot-path `var` lookup — every operator this function understands is
 * explicitly listed below. `lib/validation/scoring.ts`'s Zod schema is
 * what actually enforces the allow-list on data coming from the
 * database; this function additionally fails closed (returns `false`)
 * on anything it doesn't recognize, rather than throwing or matching,
 * so a rule with a malformed expression simply never fires instead of
 * breaking scoring for every other rule.
 */

type ScoringValue = string | number | boolean | null;

function resolveVar(path: string, context: object): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (current !== null && typeof current === "object" && segment in current) {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, context);
}

function compareNumbers(
  a: unknown,
  b: unknown,
  op: (x: number, y: number) => boolean,
): boolean {
  return typeof a === "number" && typeof b === "number" && op(a, b);
}

/**
 * Evaluates a `ScoringExpression` against a flattened context object.
 * Pure — no I/O, no mutation, no randomness, no reliance on wall-clock
 * time — so the same `(expression, context)` pair always returns the
 * same value, which is what makes `computeLeadScore` (`engine.ts`)
 * deterministic.
 */
export function evaluateExpression(
  expression: ScoringExpression,
  context: object,
): ScoringValue {
  if (expression === null || typeof expression !== "object") {
    return expression;
  }

  if ("var" in expression) {
    const value = resolveVar(expression.var, context);
    return value === undefined ? null : (value as ScoringValue);
  }
  if ("==" in expression) {
    const [a, b] = expression["=="];
    return evaluateExpression(a, context) === evaluateExpression(b, context);
  }
  if ("!=" in expression) {
    const [a, b] = expression["!="];
    return evaluateExpression(a, context) !== evaluateExpression(b, context);
  }
  if (">" in expression) {
    const [a, b] = expression[">"];
    return compareNumbers(
      evaluateExpression(a, context),
      evaluateExpression(b, context),
      (x, y) => x > y,
    );
  }
  if (">=" in expression) {
    const [a, b] = expression[">="];
    return compareNumbers(
      evaluateExpression(a, context),
      evaluateExpression(b, context),
      (x, y) => x >= y,
    );
  }
  if ("<" in expression) {
    const [a, b] = expression["<"];
    return compareNumbers(
      evaluateExpression(a, context),
      evaluateExpression(b, context),
      (x, y) => x < y,
    );
  }
  if ("<=" in expression) {
    const [a, b] = expression["<="];
    return compareNumbers(
      evaluateExpression(a, context),
      evaluateExpression(b, context),
      (x, y) => x <= y,
    );
  }
  if ("and" in expression) {
    return expression.and.every(
      (sub) => evaluateExpression(sub, context) === true,
    );
  }
  if ("or" in expression) {
    return expression.or.some(
      (sub) => evaluateExpression(sub, context) === true,
    );
  }
  if ("not" in expression) {
    return evaluateExpression(expression.not[0], context) !== true;
  }

  return false;
}
