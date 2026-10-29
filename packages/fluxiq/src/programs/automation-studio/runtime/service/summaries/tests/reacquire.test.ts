import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioRuntimeSession } from "../../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../../executor/index.ts";
import { runtimeSessionToFlowRunDetail } from "../index.ts";

// A stale target found again from its source step (t786) is in the run's
// detail, as ids and closed codes, so a reader of the step log sees it.
describe("the run detail's re-acquire record", () => {
  it("keeps where the target was found again from, and how it came out", () => {
    const record = project({ ...attempt(), reacquire: { sourceNodeId: "read", kind: "row", outcome: "found", at: 12 } });
    expect(record?.metadata?.reacquire).toEqual({ sourceNodeId: "read", kind: "row", outcome: "found" });
  });

  it("keeps the reason and a return to the source's place", () => {
    const record = project({ ...attempt(), reacquire: { sourceNodeId: "read", kind: "row", outcome: "unmatched", reason: "ambiguous", returned: true, at: 12 } });
    expect(record?.metadata?.reacquire).toEqual({ sourceNodeId: "read", kind: "row", outcome: "unmatched", reason: "ambiguous", returned: true });
  });

  it("writes nothing for an attempt that was not re-acquired", () => {
    expect(project(attempt())?.metadata).not.toHaveProperty("reacquire");
  });
});

function attempt(): AutomationStudioNodeAttemptTrace {
  return { attemptId: "confirm.attempt.7", nodeId: "confirm", definitionId: "web.click", startedAt: 10, finishedAt: 10, status: "succeeded", route: "success", inputs: {}, outputs: {}, effects: [] };
}

function project(item: AutomationStudioNodeAttemptTrace) {
  const session: AutomationStudioRuntimeSession = {
    schemaVersion: "0.1",
    runId: "run.reacquire",
    projectId: "project.reacquire",
    targetKind: "flow",
    targetId: "flow.reacquire",
    flowId: "flow.reacquire",
    status: "succeeded",
    queuedAt: 1,
    startedAt: 5,
    finishedAt: 20,
    // The conversion never reads the Flow document.
    flow: {} as AutomationStudioFlowDocument,
    trace: { status: "succeeded", startedAt: 5, finishedAt: 20, attempts: [item], values: {}, effects: [] }
  };
  return runtimeSessionToFlowRunDetail(session, "project.reacquire").actionAttempts?.[0];
}
