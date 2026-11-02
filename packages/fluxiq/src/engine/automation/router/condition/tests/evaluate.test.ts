import { expect, it } from "vitest";
import type { AutomationConditionExpression } from "@fluxiq/contracts/state";
import type { JsonObject } from "../../../../../core/index.ts";
import { evaluateExecutableRouteCondition as evaluate } from "../index.ts";

const cases: Array<{ name: string; expression?: AutomationConditionExpression; inputs?: JsonObject; state?: JsonObject; matched: boolean; reason: string }> = [
  { name: "no expression", matched: true, reason: "No condition configured." },
  { name: "zero exists", expression: { signalPath: "inputs.value", operator: "exists" }, inputs: { value: 0 }, matched: true, reason: "inputs.value exists." },
  { name: "null does not exist", expression: { signalPath: "state.value", operator: "exists" }, state: { value: null }, matched: false, reason: "state.value does not exist." },
  { name: "strict equality", expression: { signalPath: "inputs.value", operator: "equals", expected: "7" }, inputs: { value: 7 }, matched: false, reason: "inputs.value equals expected value: false." },
  { name: "missing differs", expression: { signalPath: "inputs.value", operator: "not_equals", expected: "present" }, matched: true, reason: "inputs.value differs from expected value: true." },
  { name: "numeric coercion", expression: { signalPath: "inputs.value", operator: "greater_than", expected: "2" }, inputs: { value: "3" }, matched: true, reason: "inputs.value is greater than 2: true." },
  { name: "null numeric coercion", expression: { signalPath: "inputs.value", operator: "less_than", expected: 1 }, inputs: { value: null }, matched: true, reason: "inputs.value is less than 1: true." },
  { name: "non-numeric", expression: { signalPath: "inputs.value", operator: "greater_than", expected: 1 }, inputs: { value: "unavailable" }, matched: false, reason: "inputs.value cannot be compared as a number." },
  { name: "contains", expression: { signalPath: "state.value", operator: "contains", expected: "included" }, state: { value: "included text" }, matched: true, reason: "state.value contains expected text." },
  { name: "regex coercion", expression: { signalPath: "inputs.value", operator: "matches", expected: "^42$" }, inputs: { value: 42 }, matched: true, reason: "inputs.value regex match evaluated." },
  { name: "invalid regex", expression: { signalPath: "inputs.value", operator: "matches", expected: "[" }, matched: false, reason: "inputs.value regex pattern is invalid." },
  { name: "non-pattern", expression: { signalPath: "inputs.value", operator: "matches", expected: 42 }, matched: false, reason: "inputs.value match expected value is not a pattern string." },
  { name: "normalized text", expression: { signalPath: "state.value", operator: "similar_to", expected: " alpha beta " }, state: { value: " ALPHA\n  beta " }, matched: true, reason: "state.value normalized text comparison evaluated." },
  { name: "strict boolean", expression: { signalPath: "inputs.value", operator: "became_true" }, inputs: { value: "true" }, matched: false, reason: "inputs.value is true." },
  { name: "false boolean", expression: { signalPath: "inputs.value", operator: "became_false" }, inputs: { value: false }, matched: true, reason: "inputs.value is false." },
  { name: "unsupported history", expression: { signalPath: "state.value", operator: "changed" }, state: { value: "current" }, matched: false, reason: "changed requires transition history and is not supported by the router matcher yet." },
  { name: "array traversal stays unsupported", expression: { signalPath: "inputs.values.0", operator: "exists" }, inputs: { values: ["present"] }, matched: false, reason: "inputs.values.0 does not exist." },
  { name: "empty path parts", expression: { signalPath: ".inputs..value.", operator: "exists" }, inputs: { value: "present" }, matched: true, reason: ".inputs..value. exists." }
];

it.each(cases)("preserves atomic condition and reason semantics: $name", ({ expression, inputs, state, matched, reason }) => {
  expect(evaluate(expression, { ...(inputs ? { inputs } : {}), ...(state ? { currentStateSummary: state } : {}) })).toEqual({ matched, reason });
});

it.each([
  { type: "all" as const, matched: true },
  { type: "any" as const, matched: false },
  { type: "none" as const, matched: true }
])("preserves the empty $type group", ({ type, matched }) => {
  expect(evaluate({ type, conditions: [] }, {})).toEqual({ matched, reason: `${type} group matched 0 of 0 conditions.` });
});

it("evaluates every group child in order, with nested group reasons and an exact weighted threshold", () => {
  const calls: string[] = [];
  const inputs = {
    get first() {
      calls.push("first");
      return true;
    },
    get second() {
      calls.push("second");
      return false;
    }
  };
  expect(evaluate({ type: "any", conditions: [{ signalPath: "inputs.first", operator: "equals", expected: true }, { signalPath: "inputs.second", operator: "equals", expected: true }] }, { inputs })).toEqual({ matched: true, reason: "any group matched 1 of 2 conditions." });
  expect(calls).toEqual(["first", "second"]);
  expect(evaluate({ type: "all", conditions: [{ type: "none", conditions: [{ signalPath: "inputs.absent", operator: "exists" }] }, { signalPath: "inputs.first", operator: "became_true" }] }, { inputs })).toEqual({ matched: true, reason: "all group matched 2 of 2 conditions." });
  const conditions = [{ signalPath: "inputs.first", operator: "equals" as const, expected: true, weight: 3 }, { signalPath: "inputs.second", operator: "equals" as const, expected: true, weight: 10 }];
  expect(evaluate({ type: "weighted", threshold: 3, conditions }, { inputs })).toEqual({ matched: true, reason: "Weighted condition score 3 met threshold 3." });
  expect(evaluate({ type: "weighted", threshold: 4, conditions }, { inputs })).toEqual({ matched: false, reason: "Weighted condition score 3 missed threshold 4." });
});
