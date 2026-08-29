import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams()
}));

import {
  RuntimeDebugView,
  FlowRunView,
  RuntimeAttemptRow,
  buildAutomationRuntimeRunPayload,
  runtimeAttemptsForRunDetail,
  runtimeAuditBlob,
  runtimeFlowInputPorts,
  runtimeFlowReadinessIssues,
  runtimeLlmAdaptationEvents,
  runtimeRecoveryRoutingEvents,
  runtimeRunEffects,
  runtimeRunStateEvidence,
  runtimeRunsForHistory,
  runtimeTypedInputErrors,
  sortRuntimeRunsForDebugView
} from "./index";
import { cancelRuntimeSession, executeRuntimeSession, startRuntimeSession } from "./run-commands";
import { getRuntimeRunDetail, listRuntimeRunActions, listRuntimeRunEvents, listRuntimeRuns } from "./run-queries";
import { subscribeToAutomationStudioMutations } from "../stores/mutation-transaction-store";
import { RunActionLogViewContent } from "./RunActionLogView";
import { RunHistoryViewContent } from "./RuntimeDebugView";
import { FlowRunViewContent } from "./FlowRunView";

const detailCommands = {
  loadDetail: async () => ({ ok: true as const, payload: {} }),
  listActions: async () => ({ ok: true as const, payload: {} }),
  listEvents: async () => ({ ok: true as const, payload: {} }),
  exportAudit: async () => ({ ok: true as const, payload: {} })
} as any;

describe("Automation Runs workspace", () => {
  it("separates runtime history from replay validation", () => {
    const html = renderToStaticMarkup(createElement(RuntimeDebugView, {
      projectId: "project.runs",
      pipelineArtifacts: { replayResults: [{ replayId: "replay.hidden", status: "matched" }] },
      runtimeSessions: [{ runId: "run.visible", flowId: "flow.a", status: "succeeded", updatedAt: 10 }]
    }));
    expect(html).toContain("Runtime Runs");
    expect(html).toContain("Replays");
    expect(html).toContain("run.visible");
    expect(html).not.toContain("replay.hidden");
    expect(RuntimeDebugView.toString()).toContain('activeSection === "runs"');
  });
});

describe("Automation Runtime workspace", () => {
  it("renders previous runs as compact clickable rows", () => {
    const html = renderToStaticMarkup(createElement(FlowRunView, {
      projectId: "project.debug",
      flow: { flowId: "flow.checkout", name: "Checkout", metadata: { trainingMode: "continuous_adaptive" } },
      pipelineArtifacts: { policyProposals: [], replayResults: [] },
      timelines: [],
      models: [],
      policies: [],
      runtimeSessions: [{
        runId: "run.debug.1",
        targetKind: "flow",
        targetId: "flow.checkout",
        flowId: "flow.checkout",
        status: "failed",
        queuedAt: 10,
        startedAt: 20,
        finishedAt: 45,
        trace: { attempts: [], effects: [], values: {} }
      }]
    }));

    expect(html).toContain("Previous Runs");
    expect(html).toContain('role="button"');
    expect(html).not.toContain("View Log");
    expect(html).toContain("run.debug.1");
    expect(html).toContain("Find a run");
    expect(html).toContain("First page");
    expect(html).toContain("Last page");
    expect(html).toContain("automation-runtime-run-row");
    expect(html).not.toContain("automation-runtime-run-card");
  });

  it("prefers compact action attempts over full trace hydration", () => {
    expect(runtimeAttemptsForRunDetail({
      actionAttempts: [{ attemptId: "compact.1", nodeId: "submit", comparisonStatus: "action_failed" }],
      trace: { attempts: [{ attemptId: "heavy.1", nodeId: "submit", inputs: { giant: true } }] }
    })).toEqual([{ attemptId: "compact.1", nodeId: "submit", comparisonStatus: "action_failed" }]);
  });

  it("keeps summary pages in deterministic debug order", () => {
    const runs = sortRuntimeRunsForDebugView([
      { runId: "started-latest", queuedAt: 10, startedAt: 30, finishedAt: 40, updatedAt: 40 },
      { runId: "finished-latest", queuedAt: 20, startedAt: 25, finishedAt: 90, updatedAt: 90 },
      { runId: "queued-only", queuedAt: 50 }
    ]);
    expect(runs.map((run) => run.runId)).toEqual(["finished-latest", "queued-only", "started-latest"]);
  });

  it("derives effects and named state evidence from compact action records", () => {
    const attempts = [{
      attemptId: "attempt.1",
      nodeId: "submit",
      effects: [{ type: "click", payload: { target: "#submit" } }],
      metadata: { stateRefs: { beforeAction: { stateRef: "state://before" }, afterAction: { stateRef: "state://after" }, stateDiff: { changed: true } } }
    }];
    expect(runtimeRunEffects({}, attempts)).toEqual([{ type: "click", payload: { target: "#submit" }, nodeId: "submit", attemptId: "attempt.1" }]);
    expect(runtimeRunStateEvidence({ startingStateRefs: [{ stateRef: "state://start" }] }, attempts).map((item) => item.phase)).toEqual(["Starting state", "Before action", "After action", "State diff"]);
  });

  it("orders LLM, patch, adaptation, and retry stages", () => {
    const events = runtimeLlmAdaptationEvents({
      interventions: [{ interventionId: "llm.1", kind: "diagnosis", provider: "deepseek", model: "deepseek-chat", reason: "Diagnose mismatch.", tokenUsage: { totalTokens: 30 } }],
      adaptationIds: ["adaptation.1"],
      metadata: { runtimePatchAttempts: [{ patchAttemptId: "patch.1", patchedTraceStatus: "succeeded" }], adaptiveRetry: { status: "succeeded", attemptCount: 2 } }
    });
    expect(events.map((event) => event.stage)).toEqual(["LLM", "Patch Test", "Adaptation", "Retry"]);
    expect(events[0]).toMatchObject({ provider: "deepseek", model: "deepseek-chat", usage: "30 tokens | $0" });
    expect(events[2]).toMatchObject({ adaptationId: "adaptation.1", status: "created" });
  });

  it("orders route and recovery decisions chronologically", () => {
    const events = runtimeRecoveryRoutingEvents(
      [{ decisionId: "route.1", decidedAt: 20, selectedSubflowId: "subflow.checkout", fallbackUsed: true, rejectedRuleIds: ["rule.a"] }],
      [{ recoveryId: "recovery.1", startedAt: 10, selectedKind: "retry", selectedTargetNodeId: "submit", status: "succeeded", reason: "Retry matched." }]
    );
    expect(events.map((event) => event.id)).toEqual(["recovery.1", "route.1"]);
    expect(events[1]).toMatchObject({ title: "Router fallback selected", target: "subflow.checkout", fallback: true, rejected: ["rule.a"] });
  });

  it("renders action attempts as compact rows", () => {
    const html = renderToStaticMarkup(createElement(RuntimeAttemptRow, {
      index: 0,
      attempt: {
        attemptId: "attempt.1",
        nodeId: "submit",
        definitionId: "builtin.policy.action",
        status: "failed",
        route: "failed",
        regionId: "policy",
        startedAt: 10,
        finishedAt: 20,
        message: "Confirmation was not observed.",
        inputs: { ready: true },
        outputs: { ok: false }
      },
      onSelect: () => undefined
    }));

    expect(html).toContain("automation-runtime-attempt-row");
    expect(html).toContain("Open action details");
    expect(html).not.toContain("Inputs JSON");
    expect(html).not.toContain("automation-runtime-attempt-card");
  });

  it("serializes audit downloads off the render path", async () => {
    const blob = await runtimeAuditBlob({ manifest: { actionCount: 10_000 }, runId: "run.large" });
    expect(blob.type).toBe("application/json");
    expect(await blob.text()).toContain('"actionCount": 10000');
  });

  it("renders detailed logs without expanding raw JSON", () => {
    const html = renderToStaticMarkup(createElement(RunActionLogViewContent, {
      commands: detailCommands,
      projectId: "project.debug",
      runId: "run.debug.1",
      loading: false,
      error: "",
      onBack: () => undefined,
      runDetail: {
        summary: { runId: "run.debug.1", flowId: "flow.checkout", status: "failed", startedAt: 10, finishedAt: 20, actionAttemptCount: 1 },
        actionAttempts: [{ attemptId: "attempt.1", nodeId: "submit", status: "failed", inputs: { hidden: "until-expanded" } }],
        recoveryAttempts: [{ recoveryId: "recovery.1", attemptId: "attempt.1", selectedKind: "llm_patch", status: "failed", reason: "No confirmation." }],
        interventions: [{ interventionId: "llm.1", kind: "diagnosis", provider: "test", model: "small", reason: "Diagnose failure.", tokenUsage: { totalTokens: 12 } }],
        adaptationIds: ["adaptation.1"],
        metadata: { adaptiveMetrics: { llmCallCount: 1, tokenCount: 12, recoveryAttemptCount: 1, durableBehaviorChanged: false } },
        trace: { effects: [], values: { hidden: "until-expanded" } }
      }
    }));

    expect(html).toContain("Export Audit");
    expect(html).toContain("Recovery and Routing");
    expect(html).toContain("LLM and Adaptation");
    expect(html).toContain("State and Effects");
    expect(html).toContain("automation-runtime-attempt-row");
    expect(html).not.toContain("until-expanded");
    const source = RunActionLogViewContent.toString();
    expect(source).toContain("commands.listActions");
    expect(source).toContain("commands.loadDetail");
    expect(source).toContain("commands.listEvents");
    expect(source).toContain("RUNTIME_ACTION_PAGE_SIZE");
    expect(source).toContain("Load Event Stream");
  });

  it("opens the log shell before detail and keeps events opt in", () => {
    const html = renderToStaticMarkup(createElement(RunActionLogViewContent, {
      commands: detailCommands,
      projectId: "project.debug",
      runId: "run.pending",
      loading: false,
      error: "",
      onBack: () => undefined,
      runDetail: null
    }));

    expect(html).toContain("Action Log");
    expect(html).toContain("run.pending");
    expect(html).toContain("No actions loaded yet");
    expect(html).not.toContain("Ordered Event Stream");
    expect(RunActionLogViewContent.toString()).toContain("eventPage.loaded ? eventPage.lastSequence : 0");
  });

  it("bounds action rows before detail panes are opened", () => {
    const attempts = Array.from({ length: 125 }, (_, index) => ({
      attemptId: "attempt." + index,
      nodeId: index < 50 ? "visible-node-" + index : "hidden-node-" + index,
      status: "succeeded",
      inputs: { heavyInput: "hidden-json-payload-" + index }
    }));
    const html = renderToStaticMarkup(createElement(RunActionLogViewContent, {
      commands: detailCommands,
      projectId: "project.debug",
      runId: "run.large",
      loading: false,
      error: "",
      onBack: () => undefined,
      runDetail: {
        summary: { runId: "run.large", flowId: "flow.large", status: "succeeded", actionAttemptCount: attempts.length },
        actionAttempts: attempts,
        trace: { attempts, effects: [], values: { secret: "hidden-root-state" } }
      }
    }));

    expect((html.match(/automation-runtime-attempt-row/g) ?? []).length).toBe(50);
    expect(html).toContain("1-50 of 125 actions");
    expect(html).toContain("visible-node-49");
    expect(html).not.toContain("hidden-node-50");
    expect(html).not.toContain("hidden-json-payload");
    expect(html).not.toContain("hidden-root-state");
  });

  it("loads detail, action, and event data through bounded endpoints", () => {
    const querySource = [getRuntimeRunDetail, listRuntimeRunActions, listRuntimeRunEvents].map((query) => query.toString()).join(" ");
    expect(querySource).toContain("get-flow-run-detail");
    expect(querySource).toContain("list-flow-run-actions");
    expect(querySource).toContain("list-flow-run-events");
    expect(RunActionLogViewContent.toString()).toContain("setSelectedAttempt(null)");
    expect(RunActionLogViewContent.toString()).toContain('setActionDetailView("summary")');
  });

  it("builds typed inputs and reports incomplete Flow readiness", () => {
    const flow: any = {
      flowId: "flow.typed",
      nodes: [],
      interface: {
        inputs: [
          { id: "email", name: "Email", required: true, valueType: { kind: "string" } },
          { id: "attempts", name: "Attempts", valueType: { kind: "number" }, defaultValue: 2 },
          { id: "approved", name: "Approved", valueType: { kind: "boolean" } },
          { id: "context", name: "Context", valueType: { kind: "json" } }
        ]
      }
    };
    expect(runtimeFlowInputPorts(flow)).toHaveLength(4);
    expect(runtimeTypedInputErrors(flow, { attempts: 2, approved: true, context: { source: "test" } })).toEqual(["Email is required."]);
    expect(runtimeFlowReadinessIssues(flow, { instructions: [], router: null, subflowTotal: 0, error: "" }).map((issue) => issue.action)).toEqual(["Open Instructions", "Open Nodes"]);
    expect(runtimeFlowReadinessIssues(flow, { instructions: [{ status: "active" }], router: { rules: [] }, subflowTotal: 2, error: "" }).map((issue) => issue.action)).toEqual(["Open Router"]);
  });

  it("shares SQL-backed run history and scopes initial rows", () => {
    const runs = [{ runId: "run.a", flowId: "flow.a", updatedAt: 1 }, { runId: "run.b", flowId: "flow.b", updatedAt: 2 }];
    expect(runtimeRunsForHistory(runs, "flow.a").map((run) => run.runId)).toEqual(["run.a"]);
    const source = RunHistoryViewContent.toString();
    expect(listRuntimeRuns.toString()).toContain("list-flow-runs");
    expect(source).toContain("props.historyCommands.listRuns");
    expect(source).not.toContain("get-flow-run-detail");
    expect(source).toContain("runListRequestRef");
    expect(source).toContain("subscribeToAutomationStudioMutations");
    expect(subscribeToAutomationStudioMutations).toBeTypeOf("function");
    expect(source).not.toContain("setInterval");
  });

  it("queues runs before execution so active runs can be stopped", () => {
    const source = FlowRunViewContent.toString();
    expect(source).toContain("commands.start");
    expect(source).toContain("commands.execute");
    expect(source).toContain("commands.cancel");
    expect(source.indexOf("commands.start")).toBeLessThan(source.indexOf("commands.execute"));
    expect(startRuntimeSession.toString()).toContain("start-runtime-session");
    expect(executeRuntimeSession.toString()).toContain("run-runtime-session");
    expect(cancelRuntimeSession.toString()).toContain("cancel-runtime-session");
    expect(source).toContain("activeRunId");
    expect(source).toContain("liveRunId");
  });

  it("builds runtime payloads with mode, input, and step limits", () => {
    expect(buildAutomationRuntimeRunPayload({
      projectId: "project.debug",
      flowId: "flow.checkout",
      mode: "manual_approval",
      inputText: '{"state":{"ready":true}}',
      maxSteps: "25"
    })).toEqual({
      ok: true,
      payload: {
        projectId: "project.debug",
        flowId: "flow.checkout",
        inputs: { state: { ready: true } },
        adaptiveMode: "manual_approval",
        maxSteps: 25
      }
    });
    expect(buildAutomationRuntimeRunPayload({
      projectId: "project.debug",
      flowId: "flow.checkout",
      mode: "default",
      inputText: "[1]",
      maxSteps: "10"
    })).toEqual({ ok: false, error: "Inputs must be a JSON object." });
  });
});