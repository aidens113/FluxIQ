import { expect, it } from "vitest";
import { copyAutomationExecutionOptions, hasAutomationExecutionObservation } from "../../execution-admission/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../contracts/index.ts";
import { AutomationExpectationCollector, AutomationExpectationDiagnostics } from "../index.ts";

it("inherits only diagnostic bindings through ordinary and deferred copies, without admission or enumerable fields", () => {
  const source: AutomationStudioGraphExecutionOptions = { maxSteps: 3 };
  const collector = new AutomationExpectationCollector();
  AutomationExpectationDiagnostics.bind(source, collector);
  const copied = copyAutomationExecutionOptions(source, { maxSteps: 4 });
  const deferred = copyAutomationExecutionOptions(copied, {}, null);
  const fact = { attemptId: "attempt.original", source: "transition_comparison", declaredCount: 1, checkedCount: 1, outcome: "passed" as const };
  AutomationExpectationDiagnostics.record(deferred, fact);
  expect(collector.facts(fact.attemptId)).toEqual([fact]);
  expect(source).toEqual({ maxSteps: 3 });
  expect(copied).toEqual({ maxSteps: 4 });
  expect(Reflect.ownKeys(deferred)).toEqual(["maxSteps"]);
  expect(hasAutomationExecutionObservation(deferred)).toBe(false);
  expect(AutomationExpectationDiagnostics.has(copyAutomationExecutionOptions(undefined, source))).toBe(false);
  expect(AutomationExpectationDiagnostics.has(copyAutomationExecutionOptions(JSON.parse(JSON.stringify(source))))).toBe(false);
});

it("keeps an enclosing collector while adding a nested trial collector exactly once", () => {
  const outer = new AutomationExpectationCollector();
  const inner = new AutomationExpectationCollector();
  const source: AutomationStudioGraphExecutionOptions = {};
  AutomationExpectationDiagnostics.bind(source, outer);
  const nested = copyAutomationExecutionOptions(source);
  AutomationExpectationDiagnostics.bind(nested, inner);
  AutomationExpectationDiagnostics.bind(nested, inner);
  const next = copyAutomationExecutionOptions(nested);
  const fact = { attemptId: "attempt.nested", source: "policy_node", declaredCount: 1, checkedCount: 0, outcome: "unknown" as const };
  AutomationExpectationDiagnostics.record(next, fact);
  expect(outer.facts(fact.attemptId)).toEqual([fact]);
  expect(inner.facts(fact.attemptId)).toEqual([fact]);
  AutomationExpectationDiagnostics.record(source, { ...fact, attemptId: "attempt.outer" });
  expect(inner.facts("attempt.outer")).toEqual([]);
});
