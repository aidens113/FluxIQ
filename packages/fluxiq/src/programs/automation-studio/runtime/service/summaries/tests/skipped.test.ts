import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioRuntimeSession } from "../../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../../executor/index.ts";
import { automationStudioRunDetailSkipped, runtimeSessionToFlowRunDetail } from "../index.ts";

// A step passed over keeps why: not shown, routed past, or already done in
// this run (t411). An act already done read as `target_absent` (t415).
describe("the run detail's skipped record", () => {
  it("keeps an act already done as its own reason, with the attempt and the row it was done for", () => {
    const record = project({ ...attempt(), skipped: { reason: "already_done", code: "executor.act.already_done", attemptId: "confirm.attempt.3", row: "Lin Zhao" } });
    expect(record?.skipped).toEqual({ reason: "already_done", code: "executor.act.already_done", attemptId: "confirm.attempt.3", row: "Lin Zhao" });
    expect(record?.status).toBe("succeeded");
    expect(record?.route).toBe("success");
  });

  it("keeps an act already done that runs once, with no row", () => {
    expect(automationStudioRunDetailSkipped({ ...attempt(), skipped: { reason: "already_done", code: "executor.act.already_done", attemptId: "confirm.attempt.3" } }))
      .toEqual({ reason: "already_done", code: "executor.act.already_done", attemptId: "confirm.attempt.3" });
  });

  it("keeps a state route and a step that was not shown as they were", () => {
    expect(automationStudioRunDetailSkipped({ ...attempt(), skipped: { reason: "state_routed", code: "web.target.not_found", toNodeId: "node.next", direction: "forward" } }))
      .toEqual({ reason: "state_routed", code: "web.target.not_found", toNodeId: "node.next", direction: "forward" });
    expect(automationStudioRunDetailSkipped({ ...attempt(), skipped: { reason: "target_absent", code: "executor.ready_state.not_shown" } }))
      .toEqual({ reason: "target_absent", code: "executor.ready_state.not_shown" });
  });

  it("drops a stored record outside Core's shapes, and writes nothing for a step that ran", () => {
    const broken = { ...attempt(), skipped: { reason: "already_done", code: "executor.act.already_done", attemptId: "an id with spaces" } } as AutomationStudioNodeAttemptTrace;
    expect(automationStudioRunDetailSkipped(broken)).toBeUndefined();
    expect(automationStudioRunDetailSkipped({ ...attempt(), skipped: { reason: "target_absent" } } as unknown as AutomationStudioNodeAttemptTrace)).toBeUndefined();
    expect(project(attempt())).not.toHaveProperty("skipped");
  });
});

function attempt(): AutomationStudioNodeAttemptTrace {
  return { attemptId: "confirm.attempt.7", nodeId: "confirm", definitionId: "web.click", startedAt: 10, finishedAt: 10, status: "succeeded", route: "success", inputs: {}, outputs: {}, effects: [] };
}

function project(item: AutomationStudioNodeAttemptTrace) {
  const session: AutomationStudioRuntimeSession = {
    schemaVersion: "0.1",
    runId: "run.skipped",
    projectId: "project.skipped",
    targetKind: "flow",
    targetId: "flow.skipped",
    flowId: "flow.skipped",
    status: "succeeded",
    queuedAt: 1,
    startedAt: 5,
    finishedAt: 20,
    // The conversion never reads the Flow document.
    flow: {} as AutomationStudioFlowDocument,
    trace: { status: "succeeded", startedAt: 5, finishedAt: 20, attempts: [item], values: {}, effects: [] }
  };
  return runtimeSessionToFlowRunDetail(session, "project.skipped").actionAttempts?.[0];
}
