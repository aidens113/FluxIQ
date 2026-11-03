import { expect, it } from "vitest";
import type { JsonValue } from "../../../../core/index.ts";
import type { AutomationNodeExpectationEvaluation, AutomationNodeExpectationEvaluationContext } from "../../../../components/automation/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../contracts/index.ts";
import { AutomationExpectationCollector, AutomationExpectationDiagnostics, invokeAutomationExpectation, type AutomationExpectationFact } from "../index.ts";

type EvaluationCase = Pick<AutomationExpectationFact, "declaredCount" | "checkedCount" | "outcome"> & {
  label: string;
  evaluation: AutomationNodeExpectationEvaluation;
};

const evaluations: EvaluationCase[] = [
  { label: "complete positive", declaredCount: 2, evaluation: { passed: true, checkedConditionCount: 2 }, checkedCount: 2, outcome: "passed" },
  { label: "partial positive", declaredCount: 2, evaluation: { passed: true, checkedConditionCount: 1 }, checkedCount: 1, outcome: "unknown" },
  { label: "empty positive", declaredCount: 0, evaluation: { passed: true, checkedConditionCount: 0 }, checkedCount: 0, outcome: "unknown" },
  { label: "uncounted positive", declaredCount: 2, evaluation: { passed: true }, checkedCount: 0, outcome: "unknown" },
  { label: "uncounted explicit negative", declaredCount: 2, evaluation: { passed: false }, checkedCount: 0, outcome: "failed" },
  { label: "partially counted explicit negative", declaredCount: 2, evaluation: { passed: false, checkedConditionCount: 1 }, checkedCount: 1, outcome: "failed" }
];

it.each(evaluations)("records $label after the original host, method and tuple return", async fixture => {
  const collector = new AutomationExpectationCollector();
  const options: AutomationStudioGraphExecutionOptions = {};
  AutomationExpectationDiagnostics.bind(options, collector);
  const conditions: JsonValue[] = Array.from({ length: fixture.declaredCount }, (_, id) => ({ id }));
  const context: AutomationNodeExpectationEvaluationContext = { source: "transition_comparison", attemptId: "attempt.original", stateRef: "state.original" };
  class Host {
    #calls = 0;
    get calls() { return this.#calls; }
    expectationEvaluator(given: JsonValue[], mode: string, timeoutMs: number, actual: AutomationNodeExpectationEvaluationContext): AutomationNodeExpectationEvaluation {
      expect(this).toBe(host);
      expect(given).toBe(conditions);
      expect(actual).toBe(context);
      expect(mode).toBe("all");
      expect(timeoutMs).toBe(42);
      expect(collector.facts("attempt.original")).toEqual([]);
      this.#calls++;
      return fixture.evaluation;
    }
  }
  const host = Object.freeze(new Host());
  const original = host.expectationEvaluator;
  expect(await invokeAutomationExpectation(options, { receiver: host, callback: original, args: [conditions, "all", 42, context] })).toBe(fixture.evaluation);
  expect(host.expectationEvaluator).toBe(original);
  expect(host.calls).toBe(1);
  expect(collector.facts("attempt.original")).toEqual([{ attemptId: "attempt.original", source: "transition_comparison", declaredCount: fixture.declaredCount, checkedCount: fixture.checkedCount, outcome: fixture.outcome }]);
});

it("records unknown before rethrowing the exact original evaluator error", async () => {
  const collector = new AutomationExpectationCollector();
  const options: AutomationStudioGraphExecutionOptions = {};
  AutomationExpectationDiagnostics.bind(options, collector);
  const failure = new Error("controlled evaluator failed");
  const host = { expectationEvaluator(): never { throw failure; } };
  await expect(invokeAutomationExpectation(options, { receiver: host, callback: host.expectationEvaluator, args: [[{ id: 1 }], "all", 0, { source: "policy_node", attemptId: "attempt.failed" }] })).rejects.toBe(failure);
  expect(collector.facts("attempt.failed")).toEqual([{ attemptId: "attempt.failed", source: "policy_node", declaredCount: 1, checkedCount: 0, outcome: "unknown" }]);
});

it("does not record an answer while its original evaluator is still pending", async () => {
  const collector = new AutomationExpectationCollector();
  const options: AutomationStudioGraphExecutionOptions = {};
  AutomationExpectationDiagnostics.bind(options, collector);
  let release!: (value: AutomationNodeExpectationEvaluation) => void;
  const held = new Promise<AutomationNodeExpectationEvaluation>(resolve => { release = resolve; });
  const host = { expectationEvaluator: () => held };
  const running = invokeAutomationExpectation(options, { receiver: host, callback: host.expectationEvaluator, args: [[{ id: 1 }], "all", 0, { source: "policy_node", attemptId: "attempt.held" }] });
  expect(collector.facts("attempt.held")).toEqual([]);
  const answer = { passed: true, checkedConditionCount: 1 };
  release(answer);
  expect(await running).toBe(answer);
  expect(collector.outcome("attempt.held")).toBe("passed");
});

it("does not inspect diagnostic result fields when no collector is bound", async () => {
  let reads = 0;
  const answer: AutomationNodeExpectationEvaluation = {
    get passed(): boolean {
      reads++;
      throw new Error("An unobserved caller did not ask to inspect the result.");
    },
    get checkedConditionCount(): number {
      reads++;
      throw new Error("An unobserved caller did not ask to count checks.");
    }
  };
  const host = { expectationEvaluator: () => answer };
  expect(await invokeAutomationExpectation({}, { receiver: host, callback: host.expectationEvaluator, args: [[], "all", 0, { source: "policy_node" }] })).toBe(answer);
  expect(reads).toBe(0);
});
