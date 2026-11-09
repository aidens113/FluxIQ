import type { DataExpression } from "@fluxiq/contracts/fluxnode";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { applyOperator } from "./apply-operator.ts";
import { readField } from "./field-access.ts";
import { isTruthy } from "./is-truthy.ts";

/** The values an expression reads: the current record, and the pipeline's inputs. */
export type ExpressionScope = { record: JsonValue; inputs: JsonObject };

/**
 * Evaluates a declared expression with no model and no code: a missing field is null,
 * and an operator given values it cannot use gives null (or false for a test).
 * `if` and `coalesce` evaluate only what they need.
 */
export function evaluateExpression(expression: DataExpression, scope: ExpressionScope): JsonValue {
  if ("field" in expression) return readField(scope.record, expression.field);
  if ("input" in expression) return readField(scope.inputs, expression.input);
  if ("value" in expression) return expression.value;
  if ("list" in expression) return expression.list.map((item) => evaluateExpression(item, scope));
  if ("object" in expression) {
    const built: JsonObject = {};
    for (const [key, item] of Object.entries(expression.object)) Object.defineProperty(built, key, { value: evaluateExpression(item, scope), enumerable: true, writable: true, configurable: true });
    return built;
  }
  if (expression.op === "if") {
    const [condition, then, otherwise] = expression.args as [DataExpression, DataExpression, DataExpression];
    return evaluateExpression(isTruthy(evaluateExpression(condition, scope)) ? then : otherwise, scope);
  }
  if (expression.op === "coalesce") {
    for (const arg of expression.args) {
      const value = evaluateExpression(arg, scope);
      if (value !== null) return value;
    }
    return null;
  }
  return applyOperator(expression.op, expression.args.map((arg) => evaluateExpression(arg, scope)));
}
