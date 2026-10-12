// How many rows an attempt captured, read off a live trace and off a saved one.
//
// A run's saved trace holds a `$dataset` marker where the captured rows were
// (`executor/record-summary.ts`), and a later run is judged as a replay from
// exactly that trace. Counting only a live array read every saved extraction as
// "captured nothing", so no replay of an extraction Flow could prove its change
// and `established` was unreachable for the Flows the MVP builds (t176).

import { describe, expect, it } from "vitest";
import type { AutomationStudioTransitionComparison } from "../../executor/index.ts";
import { automationStudioAttemptCapturedRecords, automationStudioAttemptDeclaredRoute, automationStudioAttemptSettled, automationStudioRetriedAttemptIds } from "../attempt-projection.ts";

const SAVES = [{ type: "policy.output.dispatch", payload: { outputId: "read", recordOutput: { datasetId: "products" } } }];

describe("the rows an attempt captured", () => {
  it("counts a live array", () => {
    expect(automationStudioAttemptCapturedRecords({ effects: SAVES, outputs: { records: [{ name: "Alpha" }, { name: "Gamma" }] } })).toEqual({ captured: 2 });
  });

  it("counts the marker a saved trace holds in the rows' place", () => {
    expect(automationStudioAttemptCapturedRecords({ effects: SAVES, outputs: { records: { $dataset: { datasetId: "products", recordCount: 2, schemaDigest: "sha256:x" } } } })).toEqual({ captured: 2 });
  });

  it("reads a malformed marker, or none, as nothing captured, and a step that saves nothing as no answer", () => {
    for (const records of [{ $dataset: { datasetId: "products", recordCount: -1 } }, { $dataset: { recordCount: "2" } }, "withheld", undefined]) {
      expect(automationStudioAttemptCapturedRecords({ effects: SAVES, outputs: { records } as never })).toEqual({ captured: 0 });
    }
    expect(automationStudioAttemptCapturedRecords({ effects: [], outputs: { records: [{ name: "Alpha" }] } })).toBeUndefined();
  });
});

// Each automatic retry is an attempt of its own, linked to the one it replaces
// by `retry.previousAttemptId` (`executor/graph-run.ts`). A trial and a replay
// both ask this one helper which attempts were replaced, so they cannot answer
// differently (t375).
describe("the attempts an automatic retry replaced", () => {
  const retry = (previousAttemptId: string, attemptNumber: number) => ({ attemptNumber, maxAttempts: 4, backoffMs: 250, rung: "retry_node" as const, previousAttemptId });

  it("names every attempt a later attempt of the same node retried, and not the one that stood", () => {
    const retried = automationStudioRetriedAttemptIds([
      { attemptId: "press.attempt.1", nodeId: "press" },
      { attemptId: "press.attempt.2", nodeId: "press", retry: retry("press.attempt.1", 2) },
      { attemptId: "press.attempt.3", nodeId: "press", retry: retry("press.attempt.2", 3) },
      { attemptId: "next.attempt.4", nodeId: "next" }
    ]);
    expect([...retried]).toEqual(["press.attempt.1", "press.attempt.2"]);
  });

  it("names nothing for a failure no retry followed", () => {
    expect(automationStudioRetriedAttemptIds([{ attemptId: "press.attempt.1", nodeId: "press" }, { attemptId: "next.attempt.2", nodeId: "next" }]).size).toBe(0);
  });

  it("follows a retry past attempts of other nodes in between, such as a cleared interference", () => {
    const retried = automationStudioRetriedAttemptIds([
      { attemptId: "press.attempt.1", nodeId: "press" },
      { attemptId: "dismiss.attempt.2", nodeId: "dismiss" },
      { attemptId: "press.attempt.3", nodeId: "press", retry: retry("press.attempt.1", 2) }
    ]);
    expect([...retried]).toEqual(["press.attempt.1"]);
  });

  it("ignores a link to another node's attempt, or to an attempt that has not run", () => {
    const retried = automationStudioRetriedAttemptIds([
      { attemptId: "other.attempt.1", nodeId: "other" },
      { attemptId: "press.attempt.2", nodeId: "press", retry: retry("other.attempt.1", 2) },
      { attemptId: "press.attempt.3", nodeId: "press", retry: retry("press.attempt.4", 2) },
      { attemptId: "press.attempt.4", nodeId: "press" }
    ]);
    expect(retried.size).toBe(0);
  });
});

// t384: an attempt that failed where the state its node was recorded to produce
// already held (`stateHeld`, the ladder's `skip_satisfied_node` rung) is its node
// done. The attempt still says `failed`; only what the node came to reads done.
describe("what the node came to at an attempt", () => {
  const held = { rung: "skip_satisfied_node" as const, route: "success" as const };

  it("reads a failed attempt whose state already held as done down success", () => {
    expect(automationStudioAttemptSettled({ status: "failed", route: "failed", stateHeld: held })).toEqual({ status: "succeeded", route: "success" });
  });

  it("reads every other attempt as it stands", () => {
    expect(automationStudioAttemptSettled({ status: "failed", route: "failed" })).toEqual({ status: "failed", route: "failed" });
    expect(automationStudioAttemptSettled({ status: "succeeded", route: "next" })).toEqual({ status: "succeeded", route: "next" });
    expect(automationStudioAttemptSettled({ status: "waiting" })).toEqual({ status: "waiting" });
  });

  it("reads the executor's `failed` default on a failed attempt as no declaration, and a node's own route as one", () => {
    const comparing = (expectedRoute: string): AutomationStudioTransitionComparison => ({
      comparisonId: "c", nodeId: "n", attemptId: "a", status: "matched",
      expected: { transitionId: "t.expected", nodeId: "n", definitionId: "d", expectedRoute },
      actual: { transitionId: "t.actual", nodeId: "n", definitionId: "d", status: "failed", outputs: {}, effects: [], startedAt: 1 },
      diffSummary: { missingOutputIds: [], unexpectedOutputIds: [], missingEffectTypes: [], unexpectedEffectTypes: [], routeMatched: true, statusMatched: true, stateCheckCount: 0 }
    });
    expect(automationStudioAttemptDeclaredRoute({ status: "failed", transitionComparison: comparing("failed") })).toBeUndefined();
    expect(automationStudioAttemptDeclaredRoute({ status: "failed", transitionComparison: comparing("success") })).toBe("success");
    expect(automationStudioAttemptDeclaredRoute({ status: "succeeded", transitionComparison: comparing("failed") })).toBe("failed");
    expect(automationStudioAttemptDeclaredRoute({ status: "succeeded" })).toBeUndefined();
  });
});
