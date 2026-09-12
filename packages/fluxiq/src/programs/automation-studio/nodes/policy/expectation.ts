import { jsonParameter } from "./shared.ts";
import type { AutomationNodeExecutionContext, AutomationNodeExecutionResult, AutomationNodeExpectationEvaluation } from "../contracts.ts";
import type { JsonValue } from "../../../../core/index.ts";
import { defineBuiltinNode } from "../shared/definition.ts";

// Core cannot decide whether an expected state holds: only the host can see the
// state. Without a bound evaluator the node keeps its unconditional pass.
const EXPECTATION_REJECTED_FAILURE = Object.freeze({
  category: "expected_state_missing",
  code: "core.policy.expectation_rejected",
  retryable: true,
  stage: "verification"
} as const);

export const expectationNode = defineBuiltinNode({
  id: "builtin.policy.expectation",
  label: "Expectation",
  description: "Check whether expected task state is true after an action.",
  class: "policy",
  scope: "policy",
  inputs: [{ id: "signals", label: "Signals", valueType: "signal", multiple: true }],
  outputs: [
    { id: "passed", label: "Passed", valueType: "boolean" },
    { id: "failed", label: "Failed", valueType: "boolean" }
  ],
  parameters: [
    { id: "conditions", label: "Expected conditions", description: "State checks this node should evaluate.", valueType: "array", defaultValue: [] },
    {
      id: "mode",
      label: "Required matches",
      description: "Choose whether every condition or just one condition must pass.",
      valueType: "string",
      defaultValue: "all",
      options: [
        { label: "All conditions must pass", value: "all" },
        { label: "Any condition may pass", value: "any" }
      ]
    },
    { id: "timeoutMs", label: "Wait up to milliseconds", description: "How long to wait for expected state to appear.", valueType: "number", defaultValue: 1000 }
  ],
  icon: "list-checks",
  execute: async (context) => {
    const conditions = jsonParameter(context.parameters.conditions, []);
    const mode = typeof context.parameters.mode === "string" ? context.parameters.mode : "all";
    const timeoutMs = typeof context.parameters.timeoutMs === "number" ? context.parameters.timeoutMs : 1000;
    const effects = [{ type: "policy.expectation.checked", payload: { conditions, mode, timeoutMs } }];
    const evaluation = await evaluateExpectation(context, conditions, mode, timeoutMs);
    if (!evaluation || evaluation.passed) {
      return { status: "success", route: "passed", outputs: { passed: true, failed: false }, effects };
    }
    return {
      status: "failed",
      route: "failed",
      outputs: { passed: false, failed: true },
      effects,
      message: evaluation.message ?? "The host reported that the expected state does not hold.",
      failure: evaluation.failure ?? { ...EXPECTATION_REJECTED_FAILURE }
    } satisfies AutomationNodeExecutionResult;
  }
});

async function evaluateExpectation(
  context: AutomationNodeExecutionContext,
  conditions: JsonValue,
  mode: string,
  timeoutMs: number
): Promise<AutomationNodeExpectationEvaluation | undefined> {
  if (!context.expectationEvaluator) return undefined;
  return await context.expectationEvaluator(
    Array.isArray(conditions) ? conditions : [conditions],
    mode,
    timeoutMs,
    { source: "policy_node", ...(context.signal ? { signal: context.signal } : {}) }
  );
}
