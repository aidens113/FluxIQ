import { expect, it } from "vitest";
import { AutomationExpectationCollector } from "../index.ts";

it("replaces a same-source recheck and leaves different sources unknown after further rechecks", () => {
  const collector = new AutomationExpectationCollector();
  const fact = { attemptId: "attempt.original", source: "transition_comparison", declaredCount: 2, checkedCount: 2, outcome: "failed" as const };
  expect(collector.outcome(fact.attemptId)).toBe("unknown");
  collector.record(fact);
  expect(collector.outcome(fact.attemptId)).toBe("failed");
  collector.record({ ...fact, outcome: "passed" });
  expect(collector.outcome(fact.attemptId)).toBe("passed");
  expect(collector.facts(fact.attemptId)).toEqual([{ ...fact, outcome: "passed" }]);
  collector.record({ ...fact, source: "policy_node", outcome: "passed" });
  expect(collector.outcome(fact.attemptId)).toBe("unknown");
  collector.record({ ...fact, source: "policy_node", outcome: "passed" });
  expect(collector.outcome(fact.attemptId)).toBe("unknown");
  expect(collector.facts(fact.attemptId)).toHaveLength(2);
});

it("copies only frozen diagnostic fields and retains no conditions or host values", () => {
  const collector = new AutomationExpectationCollector();
  const fact = { attemptId: "attempt.original", source: "transition_comparison", declaredCount: 2, checkedCount: 2, outcome: "passed" as const, extra: { synthetic: "must not be retained" } };
  collector.record(fact);
  fact.checkedCount = 0;
  const retained = collector.facts(fact.attemptId);
  expect(retained).toEqual([{ attemptId: "attempt.original", source: "transition_comparison", declaredCount: 2, checkedCount: 2, outcome: "passed" }]);
  expect(Object.isFrozen(retained[0])).toBe(true);
  expect(collector.outcome("another.attempt")).toBe("unknown");
});
