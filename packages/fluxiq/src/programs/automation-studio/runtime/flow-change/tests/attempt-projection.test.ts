// How many rows an attempt captured, read off a live trace and off a saved one.
//
// A run's saved trace holds a `$dataset` marker where the captured rows were
// (`executor/record-summary.ts`), and a later run is judged as a replay from
// exactly that trace. Counting only a live array read every saved extraction as
// "captured nothing", so no replay of an extraction Flow could prove its change
// and `established` was unreachable for the Flows the MVP builds (t176).

import { describe, expect, it } from "vitest";
import { automationStudioAttemptCapturedRecords, automationStudioRetriedAttemptIds } from "../attempt-projection.ts";

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
