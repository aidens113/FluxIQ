import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioFlowRunHandlerExecutionRecord, AutomationStudioRuntimeSession } from "../../../../model/index.ts";
import type { AutomationStudioGraphExecutionTrace } from "../../../executor/index.ts";
import { runtimeSessionToFlowRunDetail } from "../index.ts";

const record: AutomationStudioFlowRunHandlerExecutionRecord = {
  executionId: "handler-execution-1",
  handlerId: "graph.main/h.popup",
  event: "before",
  framePath: ["invocation-1"],
  nodeId: "press",
  disposition: { kind: "resume" },
  outcome: "succeeded",
  startedAt: 6,
  finishedAt: 7
};

describe("runtimeSessionToFlowRunDetail handlerExecutions", () => {
  it("projects the root trace's handler executions into the run detail", () => {
    const detail = runtimeSessionToFlowRunDetail(session({ handlerExecutions: [record] }), "project.handlers");
    expect(detail.handlerExecutions).toEqual([record]);
    expect(detail.handlerExecutions?.[0]).not.toBe(record);
  });

  it("leaves handlerExecutions absent when no handler ran", () => {
    expect("handlerExecutions" in runtimeSessionToFlowRunDetail(session({}), "project.handlers")).toBe(false);
    expect("handlerExecutions" in runtimeSessionToFlowRunDetail(session({ handlerExecutions: [] }), "project.handlers")).toBe(false);
  });
});

function session(extra: Partial<AutomationStudioGraphExecutionTrace>): AutomationStudioRuntimeSession {
  return {
    schemaVersion: "0.1",
    runId: "run.handlers",
    projectId: "project.handlers",
    targetKind: "flow",
    targetId: "flow.handlers",
    flowId: "flow.handlers",
    status: "succeeded",
    queuedAt: 1,
    startedAt: 5,
    finishedAt: 20,
    // The conversion never reads the Flow document.
    flow: {} as AutomationStudioFlowDocument,
    trace: { status: "succeeded", startedAt: 5, finishedAt: 20, attempts: [], values: {}, effects: [], ...extra }
  };
}
