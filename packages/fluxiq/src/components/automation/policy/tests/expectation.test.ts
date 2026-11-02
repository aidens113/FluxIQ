import { describe, expect, it } from "vitest";
import type { AutomationNodeExecutionContext, AutomationNodeExpectationEvaluation } from "../../contracts.ts";
import { expectationNode } from "../expectation.ts";

const parameters = { conditions: [{ path: "cart.items", operator: "exists" }], mode: "all", timeoutMs: 250 };

describe("builtin.policy.expectation", () => {
  it("passes unconditionally when no host evaluator is bound", async () => {
    const result = await expectationNode.execute?.(context());

    expect(result).toMatchObject({ status: "success", route: "passed", outputs: { passed: true, failed: false } });
    expect(result?.effects?.[0]).toEqual({ type: "policy.expectation.checked", payload: parameters });
  });

  it("routes failed with an expected-state failure when the bound evaluator rejects", async () => {
    const result = await expectationNode.execute?.(context(() => ({ passed: false })));

    expect(result).toMatchObject({
      status: "failed",
      route: "failed",
      outputs: { passed: false, failed: true },
      failure: { category: "expected_state_missing", code: "core.policy.expectation_rejected", retryable: true, stage: "verification" }
    });
  });

  it("keeps the evaluator's own message and failure record", async () => {
    const failure = { category: "timeout", code: "web.expectation.timed_out", retryable: true } as const;
    const result = await expectationNode.execute?.(context(() => ({ passed: false, message: "The cart stayed empty.", failure })));

    expect(result).toMatchObject({ message: "The cart stayed empty.", failure });
  });

  it("passes when the bound evaluator accepts, and forwards the parameters it was given", async () => {
    const asked: unknown[] = [];
    const result = await expectationNode.execute?.(context((...args) => {
      asked.push(args);
      return { passed: true };
    }));

    expect(result).toMatchObject({ status: "success", route: "passed", outputs: { passed: true, failed: false } });
    expect(asked).toEqual([[parameters.conditions, "all", 250, { source: "policy_node" }]]);
  });
});

function context(
  expectationEvaluator?: (...args: Parameters<NonNullable<AutomationNodeExecutionContext["expectationEvaluator"]>>) => AutomationNodeExpectationEvaluation
): AutomationNodeExecutionContext {
  return { inputs: {}, parameters, ...(expectationEvaluator ? { expectationEvaluator } : {}) };
}
