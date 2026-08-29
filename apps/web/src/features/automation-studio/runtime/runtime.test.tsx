import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RunActionLogViewContent } from "./RunActionLogView";
import { RunHistoryViewContent } from "./RuntimeDebugView";
import {
  runtimeAttemptsForRunDetail,
  runtimeLlmAdaptationEvents,
  runtimeRecoveryRoutingEvents,
  runtimeRunEffects,
  runtimeRunStateEvidence,
  sortRuntimeRunsForDebugView
} from "./run-detail-model";
import { buildAutomationRuntimeRunPayload, runtimeTypedInputErrors } from "./run-input-model";
import { getRuntimeRunDetail, listRuntimeRunActions, listRuntimeRunEvents, listRuntimeRuns, RUNTIME_ACTION_PAGE_SIZE, RUNTIME_EVENT_PAGE_SIZE, RUNTIME_RUN_PAGE_SIZE } from "./run-queries";

describe("Automation Studio runtime modules", () => {
  it("builds typed launch payloads without changing adaptive modes", () => {
    expect(buildAutomationRuntimeRunPayload({
      projectId: "project.1",
      flowId: "flow.1",
      mode: "manual_approval",
      inputText: '{"count":2}',
      maxSteps: "75"
    })).toEqual({
      ok: true,
      payload: {
        projectId: "project.1",
        flowId: "flow.1",
        inputs: { count: 2 },
        adaptiveMode: "manual_approval",
        maxSteps: 75
      }
    });
    expect(runtimeTypedInputErrors({
      interface: { inputs: [{ id: "count", name: "Count", required: true, valueType: { kind: "number" } }] }
    }, { count: "two" })).toEqual(["Count must be a number."]);
  });

  it("preserves bounded SQL summary, action, and event page sizes", () => {
    expect(RUNTIME_RUN_PAGE_SIZE).toBe(25);
    expect(RUNTIME_ACTION_PAGE_SIZE).toBe(50);
    expect(RUNTIME_EVENT_PAGE_SIZE).toBe(100);
    expect(RunHistoryViewContent.toString()).toContain("historyCommands.listRuns");
    expect(listRuntimeRuns.toString()).toContain("list-flow-runs");
    expect(RunHistoryViewContent.toString()).not.toContain("get-flow-run-detail");
    expect(RunActionLogViewContent.toString()).toContain("commands.loadDetail");
    expect(getRuntimeRunDetail.toString()).toContain("get-flow-run-detail");
    expect(RunActionLogViewContent.toString()).toContain("commands.listActions");
    expect(listRuntimeRunActions.toString()).toContain("list-flow-run-actions");
    expect(RunActionLogViewContent.toString()).toContain("commands.listEvents");
    expect(listRuntimeRunEvents.toString()).toContain("list-flow-run-events");
  });

  it("sorts summaries and derives detailed runtime evidence", () => {
    expect(sortRuntimeRunsForDebugView([
      { runId: "older", updatedAt: 1 },
      { runId: "newer", updatedAt: 2 }
    ]).map((run) => run.runId)).toEqual(["newer", "older"]);

    const attempts = runtimeAttemptsForRunDetail({
      actionAttempts: [{
        attemptId: "attempt.1",
        nodeId: "submit",
        effects: [{ type: "click", payload: { target: "#submit" } }],
        metadata: { stateRefs: { beforeAction: { stateRef: "state://before" }, afterAction: { stateRef: "state://after" } } }
      }]
    });
    expect(runtimeRunEffects({}, attempts)).toHaveLength(1);
    expect(runtimeRunStateEvidence({}, attempts).map((item) => item.phase)).toEqual(["Before action", "After action"]);
  });

  it("keeps recovery and LLM/adaptation activity in ordered user models", () => {
    expect(runtimeRecoveryRoutingEvents(
      [{ decisionId: "route.1", decidedAt: 1, selectedSubflowId: "subflow.1" }],
      [{ recoveryId: "recovery.1", startedAt: 2, status: "succeeded" }]
    ).map((event) => event.id)).toEqual(["route.1", "recovery.1"]);
    expect(runtimeLlmAdaptationEvents({
      interventions: [{ interventionId: "llm.1", status: "succeeded" }],
      adaptationIds: ["adaptation.1"]
    }).map((event) => event.stage)).toEqual(["LLM", "Adaptation"]);
  });

  it("bounds embedded action rows and leaves JSON detail closed", () => {
    const attempts = Array.from({ length: 75 }, (_, index) => ({
      attemptId: `attempt.${index}`,
      nodeId: `node.${index}`,
      status: "succeeded"
    }));
    const html = renderToStaticMarkup(createElement(RunActionLogViewContent, {
      commands: {
        loadDetail: async () => ({ ok: true as const, payload: {} }),
        listActions: async () => ({ ok: true as const, payload: {} }),
        listEvents: async () => ({ ok: true as const, payload: {} }),
        exportAudit: async () => ({ ok: true as const, payload: {} })
      },
      runId: "run.1",
      runDetail: { summary: { runId: "run.1", status: "succeeded" }, actionAttempts: attempts },
      loading: false,
      error: "",
      onBack() {}
    }));
    expect((html.match(/automation-runtime-attempt-row/g) ?? []).length).toBe(RUNTIME_ACTION_PAGE_SIZE);
    expect(html).not.toContain("automation-runtime-action-detail");
    expect(html).not.toContain("Selected event JSON");
  });
});
