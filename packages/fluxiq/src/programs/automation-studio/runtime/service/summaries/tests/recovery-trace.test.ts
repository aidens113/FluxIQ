import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioRuntimeSession } from "../../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../../executor/index.ts";
import { automationStudioRunDetailRecoveryTrace, runtimeSessionToFlowRunDetail } from "../index.ts";

// C11: the frames an attempt ran in, what its failure counted as, where its
// frame began and the handler that ran at it reach the run detail as ids,
// closed codes and times; a handler's resolved outputs never do.
const lifecycle = {
  event: "fail",
  handlerId: "handler.dismiss-popup",
  occurrence: "handler.dismiss-popup@inv.root/node.action#1:0123456789abcdef",
  conditionEvidence: [{ truth: "true", evidenceRef: "evidence.popup.1", capturedAt: 12 }, { truth: "unknown", capturedAt: 13 }],
  disposition: { kind: "route", checkpointId: "checkpoint.cart" },
  completionCheck: "true"
};

describe("the run detail's recovery trace", () => {
  it("carries framePath, failureClass, entry and lifecycle as written", () => {
    const record = project({
      ...attempt(),
      framePath: ["inv.root", "inv.child"],
      failureClass: "planned_fail",
      entry: { kind: "entry", id: "entry.signed-in", evidence: [{ truth: "true", capturedAt: 9 }] },
      lifecycle
    } as AutomationStudioNodeAttemptTrace);
    expect(record).toMatchObject({
      framePath: ["inv.root", "inv.child"],
      failureClass: "planned_fail",
      entry: { kind: "entry", id: "entry.signed-in", evidence: [{ truth: "true", capturedAt: 9 }] },
      lifecycle
    });
  });

  it("keeps a resolve disposition's kind and never its outputs", () => {
    const fields = automationStudioRunDetailRecoveryTrace({
      ...attempt(),
      lifecycle: { ...lifecycle, disposition: { kind: "resolve", outputs: { price: "£12.99 on the page" } } }
    } as unknown as AutomationStudioNodeAttemptTrace);
    expect(fields.lifecycle?.disposition).toEqual({ kind: "resolve" });
    expect(JSON.stringify(fields)).not.toContain("£12.99");
  });

  it("keeps a default entry without an id", () => {
    expect(automationStudioRunDetailRecoveryTrace({ ...attempt(), entry: { kind: "default", id: "ignored", evidence: [] } } as unknown as AutomationStudioNodeAttemptTrace))
      .toEqual({ entry: { kind: "default", evidence: [] } });
  });

  it("drops each field that is outside Core's closed shapes, whole", () => {
    const fields = automationStudioRunDetailRecoveryTrace({
      ...attempt(),
      framePath: ["inv.root", "a frame with spaces"],
      failureClass: "on_fail_pending",
      entry: { kind: "checkpoint", evidence: [] },
      lifecycle: { ...lifecycle, conditionEvidence: [{ truth: "maybe", capturedAt: 1 }] }
    } as unknown as AutomationStudioNodeAttemptTrace);
    expect(fields).toEqual({});
  });

  it("writes none of the fields for an attempt without them", () => {
    const record = project(attempt());
    for (const key of ["framePath", "failureClass", "entry", "lifecycle"]) expect(record).not.toHaveProperty(key);
  });
});

function attempt(): AutomationStudioNodeAttemptTrace {
  return { attemptId: "node.action.attempt.1", nodeId: "node.action", definitionId: "builtin.policy.action", startedAt: 10, finishedAt: 15, status: "failed", route: "failed", inputs: {}, outputs: {}, effects: [] };
}

function project(item: AutomationStudioNodeAttemptTrace) {
  const session: AutomationStudioRuntimeSession = {
    schemaVersion: "0.1",
    runId: "run.recovery-trace",
    projectId: "project.recovery-trace",
    targetKind: "flow",
    targetId: "flow.recovery-trace",
    flowId: "flow.recovery-trace",
    status: "failed",
    queuedAt: 1,
    startedAt: 5,
    finishedAt: 20,
    // The conversion never reads the Flow document.
    flow: {} as AutomationStudioFlowDocument,
    trace: { status: "failed", startedAt: 5, finishedAt: 20, attempts: [item], values: {}, effects: [] }
  };
  return runtimeSessionToFlowRunDetail(session, "project.recovery-trace").actionAttempts?.[0];
}
