import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AutomationAdaptationsWorkspace, adaptationChangedFields, adaptationObjectHref, adaptationReviewActions, adaptationReviewCopy, AutomationProblemsWorkspace, normalizeAutomationProblems, automationProblemsForScope, AutomationFlowSettingsWorkspace, AutomationInstructionsWorkspace, AutomationFlowMapWorkspace, AutomationRuntimeWorkspace, AutomationRunsWorkspace, AutomationSubflowsWorkspace, RuntimeActionLogPage, RuntimeAttemptRow, RuntimePostRunSummary, RuntimeRunHistory, adaptationReviewHref, runtimeAuditBlob, buildAutomationRuntimeRunPayload, flowMapConditionDraft, flowMapConditionExpected, flowMapConditionSummary, flowMapRoutes, routerReferencesForSubflow, subflowReadiness, runtimeAttemptsForRunDetail, runtimeLlmAdaptationEvents, runtimeRecoveryRoutingEvents, runtimeRunEffects, runtimeRunStateEvidence, runtimeRunsForHistory, sortRuntimeRunsForDebugView, buildFlowMapRouteTestPayload, readSubflowDirectoryUrlState, readInstructionDirectoryUrlState, INSTRUCTION_DRAFT_MAX_LOCAL_STORAGE_CHARS, instructionDraftStorageKey, instructionDraftIsDirty, readStoredInstructionDraft, instructionScopeTargetError, instructionImportance, instructionPriorityForImportance, INSTRUCTION_TEMPLATES, effectiveInstructionOrder, instructionDiagnostics, estimateInstructionTokens, settingsDraftIsDirty, flowGeneralRuntimeErrors, FLOW_LLM_PROVIDERS, flowLlmProvider, flowLlmSettingsErrors, applyFlowTrainingMode, applyFlowAdaptationPreset, flowAdaptationErrors, flowLimitsInterfaceErrors, flowEffectiveSettings, flowSettingsDraftFromFlow, buildFlowSettingsSavePayload, subflowSettingsErrors, subflowSettingsDraft, SubflowMappingEditor, readSettingsSection, AutomationSubflowSettingsWorkspace, AutomationTopLevelFlowSettingsWorkspace, runtimeFlowInputPorts, runtimeTypedInputErrors, runtimeFlowReadinessIssues } from "./WorkspaceViews";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams()
}));

describe("Automation Problems workspace", () => {
  it("deduplicates stable codes and scopes issues to the selected object", () => {
    const normalized = normalizeAutomationProblems([
      { id: "graph:parameter", code: "node.parameter.required", severity: "error", message: "Recipient is required.", flowId: "flow.checkout", nodeId: "node.send", artifactLabel: "Checkout Flow" },
      { id: "duplicate-id", code: "node.parameter.required", severity: "error", message: "Recipient is required.", flowId: "flow.checkout", nodeId: "node.send", artifactLabel: "Checkout Flow" },
      { id: "router:recommendation", severity: "warning", message: "Add a fallback.", flowId: "flow.checkout", routeId: "route.primary", artifactLabel: "Checkout Router" },
      { id: "recording:notice", severity: "info", message: "Evidence is old.", artifactId: "recording.one", artifactLabel: "Recording one" }
    ]);

    expect(normalized).toHaveLength(3);
    expect(normalized[0]).toMatchObject({ code: "node.parameter.required", severity: "error", blocking: true, scopeLabel: "Checkout Flow" });
    expect(automationProblemsForScope(normalized, "node.send").map((problem) => problem.code)).toEqual(["node.parameter.required"]);
    expect(automationProblemsForScope(normalized, "flow.checkout")).toHaveLength(2);
  });

  it("renders grouped severity, scope controls, friendly issue detail, and navigation", () => {
    const html = renderToStaticMarkup(createElement(AutomationProblemsWorkspace, {
      currentObjectId: "node.send",
      currentObjectLabel: "Send",
      problems: [
        { id: "graph:parameter", severity: "error", code: "node.parameter.required", label: "Send / Recipient", message: "Recipient is required.", artifactLabel: "Checkout Flow", nodeId: "node.send" },
        { id: "snapshot:warning", severity: "warning", code: "recording.stale", message: "Recording evidence is stale.", artifactLabel: "Checkout Flow", artifactKind: "recording" },
        { id: "snapshot:info", severity: "info", code: "runtime.note", message: "Runtime note.", artifactLabel: "Runtime" }
      ],
      onOpenProblem: () => undefined
    }));

    expect(html).toContain("Problem scope");
    expect(html).toContain("Whole project");
    expect(html).toContain("Current object");
    expect(html).toContain("Problem severity");
    expect(html).toContain("Errors");
    expect(html).toContain("Warnings");
    expect(html).toContain("Info");
    expect(html).toContain("Blocking errors");
    expect(html).toContain("Recommendations");
    expect(html).toContain("Information");
    expect(html).toContain("Send / Recipient");
    expect(html).toContain("node.parameter.required");
    expect(html).toContain("automation-problem-groups");
  });

  it("bounds large problem collections to 100 rows per page", () => {
    const html = renderToStaticMarkup(createElement(AutomationProblemsWorkspace, {
      problems: Array.from({ length: 101 }, (_, index) => ({ id: "problem." + index, severity: index % 2 ? "warning" : "error", message: "Issue " + index, artifactLabel: "Flow " + (index % 3) }))
    }));
    expect((html.match(/<li><button/g) ?? []).length).toBe(100);
    expect(html).toContain("1-100 of 101");
    expect(html).toContain("Next");
  });
});describe("Automation Runs workspace", () => {
  it("separates runtime history from replay validation", () => {
    const html = renderToStaticMarkup(createElement(AutomationRunsWorkspace, {
      projectId: "project.runs",
      pipelineArtifacts: { replayResults: [{ replayId: "replay.hidden", status: "matched" }] },
      runtimeSessions: [{ runId: "run.visible", flowId: "flow.a", status: "succeeded", updatedAt: 10 }]
    }));
    expect(html).toContain("Runtime Runs");
    expect(html).toContain("Replays");
    expect(html).toContain("run.visible");
    expect(html).not.toContain("replay.hidden");
    expect(AutomationRunsWorkspace.toString()).toContain('runsView === "runtime"');
  });
});
describe("Automation Runtime workspace", () => {
  it("renders the previous runs inner view with clickable rows", () => {
    const html = renderToStaticMarkup(
      createElement(AutomationRuntimeWorkspace, {
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
          flow: {
            nodes: [
              { id: "start", label: "Start", definitionId: "builtin.control.start" },
              { id: "submit", label: "Submit", definitionId: "builtin.policy.action" }
            ],
            edges: []
          },
          trace: {
            status: "failed",
            startedAt: 20,
            finishedAt: 45,
            currentNodeId: "submit",
            attempts: [{
              attemptId: "submit.attempt.1",
              nodeId: "submit",
              definitionId: "builtin.policy.action",
              startedAt: 21,
              finishedAt: 44,
              status: "failed",
              route: "failed",
              regionId: "policy",
              inputs: { ready: true },
              outputs: { ok: false },
              effects: [{ type: "output.submit", payload: { id: 123 } }],
              message: "Confirmation was not observed."
            }],
            values: { ready: true, ok: false },
            effects: [{ type: "output.submit", nodeId: "submit", payload: { id: 123 } }],
            regionTransitions: []
          }
        }]
      })
    );

    expect(html).toContain("Previous Runs");
    expect(html).toContain("role=\"button\"");
    expect(html).not.toContain("View Log");
    expect(html).toContain("run.debug.1");
    expect(html).toContain("flow:flow.checkout");
    expect(html).toContain("failed");
    expect(html).toContain("Find a run");
    expect(html).toContain("All statuses");
    expect(html).toContain("Last updated");
    expect(html).toContain("Rows");
    expect(html).toContain("First page");
    expect(html).toContain("Last page");
  });

  it("renders Subflows as a link directory without an embedded editor", () => {
    const html = renderToStaticMarkup(createElement(AutomationSubflowsWorkspace, {
      projectId: null,
      flow: { flowId: "flow.checkout", name: "Checkout" }
    }));

    expect(html).toContain("automation-subflow-directory");
    expect(html).toContain("No subflows yet");
    expect(html).toContain("plus button beside the Subflows folder");
    expect(html).not.toContain("Subflow Detail");
    expect(html).not.toContain("Show Subflow JSON");
    expect(html).not.toContain("automation-policy-canvas");
    expect(html).toContain("Search subflows");
    expect(html).toContain("All statuses");
    expect(html).toContain("Subflows per page");
    expect(html).toContain("First page");
    expect(html).toContain("Last page");
  });
  it("caps restored Subflow directory pages at 50 rows", () => {
    expect(readSubflowDirectoryUrlState("subflowPageSize=50&subflowOffset=9950")).toMatchObject({ limit: 50, offset: 9950 });
    expect(readSubflowDirectoryUrlState("subflowPageSize=100")).toMatchObject({ limit: 25, offset: 0 });
  });

  it("derives subflow router reverse references without loading run history", () => {
    const references = routerReferencesForSubflow({
      routerId: "router.checkout",
      status: "active",
      rules: [
        { ruleId: "rule.checkout", name: "Checkout", status: "active", order: 1, target: { kind: "subflow", subflowId: "subflow.checkout" }, condition: { signalPath: "inputs.mode", operator: "equals", expected: "checkout" } },
        { ruleId: "rule.other", name: "Other", status: "active", order: 2, target: { kind: "subflow", subflowId: "subflow.other" } }
      ],
      fallback: { kind: "subflow", subflowId: "subflow.checkout" }
    }, "subflow.checkout");

    expect(references).toEqual([
      { id: "rule.checkout", name: "Checkout", status: "active", order: 1, condition: "inputs.mode equals checkout" },
      { id: "router.checkout:fallback", name: "Fallback", status: "active", order: "fallback", condition: "No rule matched" }
    ]);
  });

  it("summarizes Subflow readiness independently from Router usage", () => {
    expect(subflowReadiness({ status: "active", graphFlowId: "flow.checkout.graph" })).toEqual({ label: "Ready", tone: "ready", issues: [] });
    expect(subflowReadiness({ status: "disabled" })).toEqual({ label: "Needs setup", tone: "attention", issues: ["Nodes graph is missing", "Subflow is disabled"] });
  });

  it("prefers compact run-detail action attempts over full trace hydration", () => {
    const attempts = runtimeAttemptsForRunDetail({
      actionAttempts: [
        { attemptId: "compact.1", nodeId: "submit", comparisonStatus: "action_failed" }
      ],
      trace: {
        attempts: [
          { attemptId: "heavy.1", nodeId: "submit", inputs: { giant: true } }
        ]
      }
    });

    expect(attempts).toEqual([
      { attemptId: "compact.1", nodeId: "submit", comparisonStatus: "action_failed" }
    ]);
  });

  it("keeps initial runtime sessions in the same order as loaded summary pages", () => {
    const runs = sortRuntimeRunsForDebugView([
      { runId: "started-latest", queuedAt: 10, startedAt: 30, finishedAt: 40, updatedAt: 40 },
      { runId: "finished-latest", queuedAt: 20, startedAt: 25, finishedAt: 90, updatedAt: 90 },
      { runId: "queued-only", queuedAt: 50 }
    ]);

    expect(runs.map((run) => run.runId)).toEqual(["finished-latest", "queued-only", "started-latest"]);
  });

  it("derives paged effects and named state evidence from compact action records", () => {
    const attempts = [{ attemptId: "attempt.1", nodeId: "submit", effects: [{ type: "click", payload: { target: "#submit" } }], metadata: { stateRefs: { beforeAction: { stateRef: "state://before" }, afterAction: { stateRef: "state://after" }, stateDiff: { changed: true } } } }];
    expect(runtimeRunEffects({}, attempts)).toEqual([{ type: "click", payload: { target: "#submit" }, nodeId: "submit", attemptId: "attempt.1" }]);
    expect(runtimeRunStateEvidence({ startingStateRefs: [{ stateRef: "state://start" }] }, attempts).map((item) => item.phase)).toEqual(["Starting state", "Before action", "After action", "State diff"]);
  });
  it("orders LLM, patch, adaptation, and retry stages as one readable sequence", () => {
    const events = runtimeLlmAdaptationEvents({
      interventions: [{ interventionId: "llm.1", kind: "diagnosis", provider: "deepseek", model: "deepseek-chat", reason: "Diagnose mismatch.", tokenUsage: { totalTokens: 30 } }],
      adaptationIds: ["adaptation.1"],
      metadata: { runtimePatchAttempts: [{ patchAttemptId: "patch.1", patchedTraceStatus: "succeeded" }], adaptiveRetry: { status: "succeeded", attemptCount: 2 } }
    });
    expect(events.map((event) => event.stage)).toEqual(["LLM", "Patch Test", "Adaptation", "Retry"]);
    expect(events[0]).toMatchObject({ provider: "deepseek", model: "deepseek-chat", usage: "30 tokens | $0" });
    expect(events[2]).toMatchObject({ adaptationId: "adaptation.1", status: "created" });
  });
  it("orders route and recovery decisions chronologically with friendly targets", () => {
    const events = runtimeRecoveryRoutingEvents(
      [{ decisionId: "route.1", decidedAt: 20, selectedSubflowId: "subflow.checkout", fallbackUsed: true, rejectedRuleIds: ["rule.a"] }],
      [{ recoveryId: "recovery.1", startedAt: 10, selectedKind: "retry", selectedTargetNodeId: "submit", status: "succeeded", reason: "Retry matched." }]
    );
    expect(events.map((event) => event.id)).toEqual(["recovery.1", "route.1"]);
    expect(events[1]).toMatchObject({ title: "Router fallback selected", target: "subflow.checkout", fallback: true, rejected: ["rule.a"] });
  });
  it("renders runtime action attempts as compact rows", () => {
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
    expect(html).toContain("#1");
    expect(html).toContain("submit");
    expect(html).toContain("Open action details");
    expect(html).not.toContain("Inputs JSON");
    expect(html).not.toContain("Outputs JSON");
    expect(html).not.toContain("automation-runtime-attempt-card");
  });

  it("serializes audit downloads without requiring the render path to stringify them", async () => {
    const blob = await runtimeAuditBlob({ manifest: { actionCount: 10000 }, runId: "run.large" });
    expect(blob.type).toBe("application/json");
    expect(await blob.text()).toContain('"actionCount": 10000');
  });
  it("renders runtime log audit export without expanding raw JSON", () => {
    const html = renderToStaticMarkup(createElement(RuntimeActionLogPage, {
      projectId: "project.debug",
      runId: "run.debug.1",
      loading: false,
      error: "",
      onBack: () => {},
      runDetail: {
        summary: { runId: "run.debug.1", flowId: "flow.checkout", status: "failed", startedAt: 10, finishedAt: 20, actionAttemptCount: 1 },
        actionAttempts: [{ attemptId: "attempt.1", nodeId: "submit", status: "failed", inputs: { hidden: "until-expanded" } }],
        recoveryAttempts: [{ recoveryId: "recovery.1", attemptId: "attempt.1", selectedKind: "llm_patch", status: "failed", reason: "No confirmation." }],
        interventions: [{ interventionId: "llm.1", kind: "diagnosis", provider: "test", model: "small", reason: "Diagnose failure.", tokenUsage: { totalTokens: 12 } }],
        adaptationIds: ["adaptation.1"],
        metadata: {
          adaptiveMetrics: { llmCallCount: 1, tokenCount: 12, recoveryAttemptCount: 1, durableBehaviorChanged: false },
          runtimePatchAttempts: [{ status: "failed" }]
        },
        trace: { effects: [], values: { hidden: "until-expanded" } }
      }
    }));

    expect(html).toContain("Export Audit");
    expect(RuntimeActionLogPage.toString()).toContain("exportPreparing");
    expect(RuntimeActionLogPage.toString()).toContain("runtimeAuditBlob");
    expect(html).toContain("Overview");
    expect(html).toContain("Started");
    expect(html).toContain("Finished");
    expect(html).toContain("Flow version");
    expect(html).toContain("Intervention mode");
    expect(html).toContain("Outcome");
    expect(html).toContain("Recovery and Routing");
    expect(html).toContain("Open Router");
    expect(html).toContain("LLM and Adaptation");
    expect(html).toContain("State and Effects");
    expect(html).toContain("Effects");
    expect(html).toContain("State");
    expect(html).toContain("FluxIQ created adaptation evidence for review.");
    expect(html).toContain("automation-runtime-attempt-row");
    expect(html).not.toContain("until-expanded");
    expect(RuntimeActionLogPage.toString()).toContain("list-flow-run-actions");
    expect(RuntimeActionLogPage.toString()).toContain("RUNTIME_ACTION_PAGE_SIZE");
    expect(RuntimeActionLogPage.toString()).toContain("RuntimeActionDetailPanel");
    expect(RuntimeActionLogPage.toString()).toContain("selectedAttempt");
    expect(RuntimeRunHistory.toString()).not.toContain("get-flow-run-detail");
    expect(RuntimeActionLogPage.toString()).toContain("get-flow-run-detail");
    expect(RuntimeActionLogPage.toString()).toContain("compact: true");
    expect(RuntimeActionLogPage.toString()).toContain("Load Event Stream");
    expect(RuntimeActionLogPage.toString()).toContain("Events load only when opened");
    expect(RuntimeActionLogPage.toString()).toContain("Selected event JSON");
  });

  it("opens the Runtime Debug log shell before run detail and keeps events opt-in", () => {
    const html = renderToStaticMarkup(createElement(RuntimeActionLogPage, {
      api: { post: async <T = any>() => ({ ok: true as const, payload: {} as T }) },
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
    expect(RuntimeActionLogPage.toString()).toContain("list-flow-run-actions");
    expect(RuntimeActionLogPage.toString()).toContain("list-flow-run-events");
    expect(RuntimeActionLogPage.toString()).toContain("eventPage.loaded ? eventPage.lastSequence : 0");
  });

  it("keeps raw JSON opt-in and run lists paged", () => {
    const runtimeHtml = renderToStaticMarkup(
      createElement(AutomationRuntimeWorkspace, {
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
          trace: {
            attempts: [{ attemptId: "attempt.hidden", nodeId: "submit", inputs: { hugeSecret: "should-not-render-until-expanded" } }],
            values: { hugeSecret: "should-not-render-until-expanded" },
            effects: []
          }
        }]
      })
    );
    const settingsHtml = renderToStaticMarkup(createElement(AutomationFlowSettingsWorkspace, {
      projectId: "project.debug",
      flow: { flowId: "flow.checkout", metadata: { hiddenSecret: "should-not-render-until-expanded" } }
    }));

    expect(runtimeHtml).not.toContain("View Log");
    expect(runtimeHtml).toContain("Run This Flow");
    expect(runtimeHtml).toContain("Run mode");
    expect(runtimeHtml).toContain("Fully adaptive");
    expect(runtimeHtml).toContain("Manual approval");
    expect(runtimeHtml).toContain('aria-pressed="true"');
    expect(runtimeHtml).toContain("No LLM intervention");
    expect(runtimeHtml).not.toContain("Run + Repair");
    expect(runtimeHtml).not.toContain("Preview Repair");
    expect(runtimeHtml).toContain(">Run</button>");
    expect(runtimeHtml).toContain("automation-runtime-run-command");
    expect(runtimeHtml).toContain("No run inputs declared");
    expect(runtimeHtml).toContain("Step limit");
    expect(runtimeHtml).not.toContain("Developer payload override");
    expect(runtimeHtml).not.toContain("Allow browser/API actions");
    expect(runtimeHtml).toContain("Continuous adaptive mode can create runtime adaptations.");
    expect(runtimeHtml).toContain("1-1 of 1 runs");
    expect(runtimeHtml).toContain("Visible run status summary");
    expect(runtimeHtml).toContain("automation-runtime-run-header");
    expect(runtimeHtml).toContain("automation-runtime-run-row");
    expect(runtimeHtml).not.toContain("automation-runtime-run-card");
    expect(runtimeHtml).toContain("automation-runtime-pagination-footer");
    expect(runtimeHtml).not.toContain("should-not-render-until-expanded");
    expect(settingsHtml).toContain("automation-flow-settings-workspace");
    expect(settingsHtml).toContain("Save Settings");
    expect(settingsHtml).toContain("Flow Identity");
    expect(settingsHtml).toContain("Training Mode");
    expect(settingsHtml).toContain("<strong>Safety</strong>");
    expect(settingsHtml).toContain("Adaptations");
    expect(settingsHtml).toContain("Adaptation behavior");
    expect(settingsHtml).toContain("Approval");
    expect(settingsHtml).toContain("Fully adaptive");
    expect(settingsHtml).toContain("Require first adaptation to be reviewed manually");
    expect(settingsHtml).toContain("Manual review for structural changes");
    expect(settingsHtml).toContain("Modify Flow Map routes");
    expect(settingsHtml).not.toContain("Allow external side effects");
    expect(settingsHtml).not.toContain("Allow browser/API actions");
    expect(settingsHtml).not.toContain("Require approval before browser/API actions");
    expect(settingsHtml).toContain("LLM Budget");
    expect(settingsHtml).toContain("value=\"host\"");
    expect(settingsHtml).toContain("value=\"policy.default\"");
    expect(settingsHtml).toContain("value=\"12000\"");
    expect(settingsHtml).not.toContain("summary-strip");
    expect(settingsHtml).toContain("Effective Values");
    expect(settingsHtml).not.toContain("Show Flow Settings JSON");
    expect(settingsHtml).not.toContain("should-not-render-until-expanded");
  });

  it("bounds Runtime Debug action rows before detail panes or raw JSON are opened", () => {
    const attempts = Array.from({ length: 125 }, (_, index) => ({
      attemptId: "attempt." + index,
      nodeId: index < 50 ? "visible-node-" + index : "hidden-node-" + index,
      definitionId: "builtin.policy.action",
      status: "succeeded",
      inputs: { heavyInput: "hidden-json-payload-" + index },
      outputs: { heavyOutput: "hidden-json-output-" + index },
      effects: [{ type: "debug.effect", payload: { secret: "hidden-effect-payload-" + index } }]
    }));
    const html = renderToStaticMarkup(createElement(RuntimeActionLogPage, {
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
    expect(html).not.toContain("hidden-effect-payload");
    expect(html).not.toContain("hidden-root-state");
    expect(html).not.toContain("automation-runtime-action-detail");
    expect(html).toContain("Open action details");
  });

  it("loads Runtime Debug details and paged events through bounded endpoints", () => {
    const source = RuntimeActionLogPage.toString();
    expect(source).toContain('"get-flow-run-detail", { projectId: props.projectId, runId: props.runId, compact: true }');
    expect(source).toContain('"list-flow-run-actions", { projectId: props.projectId, runId: props.runId, limit: RUNTIME_ACTION_PAGE_SIZE, offset }');
    expect(source).toContain('"list-flow-run-events", { projectId: props.projectId, runId: props.runId, afterSequence, limit: 100 }');
    expect(source).toContain("setSelectedAttempt(null)");
    expect(source).toContain('setActionDetailView("summary")');
  });

  it("builds typed runtime inputs and blocks incomplete Flow readiness", () => {
    const flow: any = { flowId: "flow.typed", nodes: [], interface: { inputs: [{ id: "email", name: "Email", required: true, valueType: { kind: "string" } }, { id: "attempts", name: "Attempts", valueType: { kind: "number" }, defaultValue: 2 }, { id: "approved", name: "Approved", valueType: { kind: "boolean" } }, { id: "context", name: "Context", valueType: { kind: "json" } }] } };
    expect(runtimeFlowInputPorts(flow)).toHaveLength(4);
    expect(runtimeTypedInputErrors(flow, { attempts: 2, approved: true, context: { source: "test" } })).toEqual(["Email is required."]);
    expect(runtimeTypedInputErrors(flow, { email: "a@example.com", attempts: "two", approved: "yes", context: "{" })).toEqual(expect.arrayContaining(["Attempts must be a number.", "Approved must be Yes or No.", "Context must be valid structured data."]));
    expect(runtimeFlowReadinessIssues(flow, { instructions: [], router: null, subflowTotal: 0, error: "" }).map((issue) => issue.action)).toEqual(["Open Instructions", "Open Nodes"]);
    expect(runtimeFlowReadinessIssues(flow, { instructions: [{ status: "active" }], router: { rules: [] }, subflowTotal: 2, error: "" }).map((issue) => issue.action)).toEqual(["Open Router"]);
    expect(runtimeFlowReadinessIssues({ ...flow, nodes: [{ id: "start" }] }, { instructions: [{ status: "active" }], router: null, subflowTotal: 0, error: "" })).toEqual([]);
  });
  it("shares SQL-backed run history and scopes initial rows to the active Flow", () => {
    const runs = [{ runId: "run.a", flowId: "flow.a", updatedAt: 1 }, { runId: "run.b", flowId: "flow.b", updatedAt: 2 }];
    expect(runtimeRunsForHistory(runs, "flow.a").map((run) => run.runId)).toEqual(["run.a"]);
    const source = RuntimeRunHistory.toString();
    expect(source).toContain("list-flow-runs");
    expect(source).toContain("props.flowId");
    expect(source).not.toContain("list-runtime-sessions");
    expect(source).toContain("runListRequestRef");
    expect(source).toContain("fluxiq:runtime-runs-changed");
    expect(source).not.toContain("setInterval");
    expect(source).toContain('window.addEventListener("focus"');
    expect(source).toContain("visibilityState");
  });
  it("queues runs before execution so active runs can be stopped and opened live", () => {
    const source = AutomationRuntimeWorkspace.toString();
    expect(source).toContain("start-runtime-session");
    expect(source).toContain("run-runtime-session");
    expect(source).toContain("cancel-runtime-session");
    expect(source.indexOf("start-runtime-session")).toBeLessThan(source.indexOf("run-runtime-session"));
    expect(source).toContain("activeRunId");
    expect(source).toContain("liveRunId");
  });
  it("builds runtime run payloads with mode, input, and step limits", () => {
    expect(buildAutomationRuntimeRunPayload({
      projectId: "project.debug",
      flowId: "flow.checkout",
      mode: "manual_approval",
      inputText: "{\"state\":{\"ready\":true}}",
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

  it("builds adaptation deep links from runtime results", () => {
    expect(adaptationReviewHref("flow.checkout", "adaptation.1")).toBe("?view=adaptations&adaptationId=adaptation.1&flowId=flow.checkout");
  });
  it("builds friendly field diffs and routes adaptation targets to their owning editors", () => {
    expect(adaptationChangedFields(
      { timeoutMs: 100, target: { selector: "#old" }, enabled: true },
      { timeoutMs: 500, target: { selector: "#new" }, enabled: true, retryCount: 2 }
    )).toEqual([
      { path: "retryCount", before: "Not set", after: "2" },
      { path: "target.selector", before: "#old", after: "#new" },
      { path: "timeoutMs", before: "100", after: "500" }
    ]);
    expect(adaptationObjectHref("edit_router", "route.1")).toEqual({ href: "?view=flow-map", label: "Open Router" });
    expect(adaptationObjectHref("edit_subflow", "subflow.recovery")).toEqual({ href: "?view=flow-subflows&subflowId=subflow.recovery", label: "Open Subflows" });
    expect(adaptationObjectHref("edit_instruction", "instruction.retry")).toEqual({ href: "?view=flow-instructions&instructionId=instruction.retry", label: "Open Instructions" });
    expect(adaptationObjectHref("edit_action_target", "action.submit")).toEqual({ href: "?view=flow-editor&nodeId=action.submit", label: "Open Node" });
  });

  it("renders the adaptive post-run story with durable change and adaptation link", () => {
    const html = renderToStaticMarkup(createElement(RuntimePostRunSummary, {
      result: {
        runtimeSession: { runId: "run.adaptive.1", flowId: "flow.checkout", status: "succeeded" },
        runSummary: { flowId: "flow.checkout", actionAttemptCount: 4, metadata: { recoveryAttemptCount: 1 } },
        interventionCount: 2,
        createdAdaptationIds: ["adaptation.retry"],
        durableBehaviorChanged: true,
        terminalReason: "Adaptive retry succeeded."
      }
    }));

    expect(html).toContain("Last Run");
    expect(html).toContain("Durable");
    expect(html).toContain("yes");
    expect(html).toContain("Adaptive retry succeeded.");
    expect(html).toContain("?view=adaptations&amp;adaptationId=adaptation.retry&amp;flowId=flow.checkout");
  });

  it("renders the adaptations inbox tabs as a separate inner view", () => {
    const html = renderToStaticMarkup(
      createElement(AutomationAdaptationsWorkspace, {
        projectId: null,
        flow: null
      })
    );

    expect(html).toContain("Adaptation Inbox");
    expect(html).toContain("Search trigger or ID");
    expect(html).toContain("All statuses");
    expect(html).toContain("All risks");
    expect(html).toContain("Last updated");
    expect(html).toContain("Page 0 of 0");
    expect(html).toContain("Select a Flow to review adaptations.");
    expect(html).not.toContain("Training Status");
    const source = AutomationAdaptationsWorkspace.toString();
    expect(source).toContain('"summary", "Summary"');
    expect(source).toContain('"changes", "Changes"');
    expect(source).toContain('"evidence", "Evidence"');
    expect(source).toContain('"validation", "Validation"');
    expect(source).toContain('"audit", "Audit"');
    expect(source.indexOf("Show complete adaptation JSON")).toBeGreaterThan(source.indexOf('detailView === "audit"'));
    expect(source).toContain("No source references were recorded.");
    expect(source).toContain("This adaptation has not been validated yet.");
    expect(source).toContain("ADAPTATION_DETAIL_PAGE_SIZE");
    expect(source).toContain("phase9.artifacts");
    expect(source).toContain("Lifecycle Events");
    expect(source).toContain("automation-adaptation-detail-pagination");
  });

  it("validates General and Runtime settings and renders user-facing runtime defaults", () => {
    const valid = { name: "Checkout", timeoutSeconds: "30", maxConcurrency: "2", trainingMode: "continuous_adaptive" as const, trainForRunCount: "3", minimumStabilityScore: "0.9" };
    expect(flowGeneralRuntimeErrors(valid)).toEqual([]);
    expect(flowGeneralRuntimeErrors({ ...valid, name: "", timeoutSeconds: "0", maxConcurrency: "1.5", trainingMode: "train_for_runs", trainForRunCount: "0" })).toEqual(expect.arrayContaining(["Flow name is required.", "Runtime timeout must be between 1 second and 1 hour.", "Concurrency must be a whole number from 1 to 100.", "Fixed training mode needs at least one run."]));
    const html = renderToStaticMarkup(createElement(AutomationFlowSettingsWorkspace, { projectId: null, flow: { flowId: "flow.checkout", name: "Checkout", metadata: {}, executionDefaults: { timeoutMs: 45000, maxConcurrency: 4 } } }));
    expect(html).toContain("Fully adaptive");
    expect(html).toContain("Fixed training runs");
    expect(html).toContain("Until stable");
    expect(html).toContain("No LLM intervention");
    expect(html).toContain("Runtime Defaults");
    expect(html).toContain("Flow timeout");
    expect(html).toContain('value="45"');
    expect(html).toContain('value="4"');
  });
  it("uses controlled LLM provider/model choices and encrypted key summaries", () => {
    expect(FLOW_LLM_PROVIDERS.map((provider) => provider.id)).toContain("deepseek");
    expect(flowLlmProvider("deepseek").models).toContain("deepseek-reasoner");
    const draft = { allowLlmIntervention: true, llmProvider: "deepseek", llmModel: "deepseek-chat", llmSecretKeyId: "" };
    expect(flowLlmSettingsErrors(draft, [], true)).toContain("Choose an enabled encrypted key for this provider.");
    expect(flowLlmSettingsErrors({ ...draft, llmSecretKeyId: "secret.deepseek" }, [{ id: "secret.deepseek" }], true)).toEqual([]);
    const html = renderToStaticMarkup(createElement(AutomationFlowSettingsWorkspace, { projectId: null, flow: { flowId: "flow.checkout", name: "Checkout", metadata: { llmProvider: "deepseek", llmModel: "deepseek-reasoner" } } }));
    expect(html).toContain("LLM Connection");
    expect(html).toContain("DeepSeek");
    expect(html).toContain("deepseek-reasoner");
    expect(html).toContain("Encrypted API key");
    expect(html).toContain("Manage Keys");
    expect(html).toContain("Secret values are never loaded here");
  });
  it("keeps adaptation presets, approval, and training behavior internally consistent", () => {
    const base: any = { trainingMode: "continuous_adaptive", adaptationPreset: "adaptive", adaptationProposalMode: "auto", proposalApprovalMode: "auto", allowLlmIntervention: true, allowAdaptationCreation: true, allowPromotion: true, allowCreateRecoveryPaths: true, allowModifySubflows: true, allowCreateSubflows: true, allowModifyRouter: true, allowModifyExpectations: true, allowModifyActionTargets: true, allowDeleteOrDisableBehavior: false, requireApprovalForDestructiveChanges: true };
    expect(applyFlowTrainingMode(base, "normal")).toMatchObject({ trainingMode: "normal", allowLlmIntervention: false, allowAdaptationCreation: false, allowPromotion: false });
    expect(applyFlowAdaptationPreset(base, "locked")).toMatchObject({ adaptationPreset: "locked", allowAdaptationCreation: false, allowPromotion: false, allowModifyRouter: false });
    expect(applyFlowAdaptationPreset(base, "adaptive")).toMatchObject({ adaptationPreset: "adaptive", allowAdaptationCreation: true, allowPromotion: true, allowDeleteOrDisableBehavior: false });
    expect(flowAdaptationErrors({ trainingMode: "normal", allowLlmIntervention: true, allowAdaptationCreation: true, allowPromotion: true, adaptationProposalMode: "manual" })).toHaveLength(2);
    const html = renderToStaticMarkup(createElement(AutomationFlowSettingsWorkspace, { projectId: null, flow: { flowId: "flow.checkout", name: "Checkout", metadata: {} } }));
    expect(html).toContain("Adaptation behavior");
    expect(html).toContain("Fully adaptive");
    expect(html).toContain("Observe only");
    expect(html).toContain("Manual for risky");
    expect(html).toContain("Manual only");
    expect(html).toContain("validated low-risk changes");
  });
  it("edits bounded recovery limits, friendly Flow interfaces, and dependencies", () => {
    const valid: any = { maxInterventionsPerRun: "2", maxTokensPerRun: "12000", maxCostUsdPerTrainingWindow: "5", maxAdaptationInterventionsPerRun: "3", maxAdaptationCostUsdPerRun: "1", maxRetriesPerAction: "1", maxRecoveryAttemptsPerSubflow: "2", maxReroutesPerRun: "2", interfaceInputs: [{ id: "input.customer", name: "Customer email", valueKind: "string", required: true, description: "", defaultValue: "" }], interfaceOutputs: [{ id: "output.result", name: "Result", valueKind: "json", required: false, description: "", defaultValue: '{"ok":true}' }] };
    expect(flowLimitsInterfaceErrors(valid)).toEqual([]);
    expect(flowLimitsInterfaceErrors({ ...valid, maxRetriesPerAction: "21", interfaceInputs: [...valid.interfaceInputs, { ...valid.interfaceInputs[0] }] })).toEqual(expect.arrayContaining(["Retries per action must be a whole number from 0 to 20.", "Input names must be unique."]));
    const html = renderToStaticMarkup(createElement(AutomationFlowSettingsWorkspace, { projectId: null, flow: { flowId: "flow.checkout", name: "Checkout", scope: { kind: "global" }, source: { mode: "visual" }, interface: { inputs: [{ id: "input.customer", name: "Customer email", valueType: { kind: "string" }, required: true }], outputs: [{ id: "output.result", name: "Result", valueType: { kind: "json" } }] }, nodes: [{ id: "call.billing", definitionId: "builtin.control.call-flow", parameterValues: { flowId: "flow.billing", version: "2.1.0" } }], metadata: {} } }));
    expect(html).toContain("Flow Inputs");
    expect(html).toContain("Flow Outputs");
    expect(html).toContain("Customer email");
    expect(html).toContain("Add input");
    expect(html).toContain("Dependencies");
    expect(html).toContain("Recovery limits");
    expect(html).toContain("side-effect access are enforced by runtime capability grants");
    expect(html).not.toContain('value="input.customer"');
  });
  it("shows effective sources and removes reset overrides from persistence", () => {
    const flow: any = { flowId: "flow.override", name: "Override", source: { mode: "visual" }, interface: { inputs: [], outputs: [] }, executionDefaults: { timeoutMs: 90000 }, metadata: { llmProvider: "deepseek", llmModel: "deepseek-chat", trainingModeSettings: { recoveryBudget: { maxRetriesPerAction: 4 } } } };
    const draft: any = flowSettingsDraftFromFlow(flow);
    expect(flowEffectiveSettings(flow, draft)).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "timeoutSeconds", source: "Flow override", resettable: true }),
      expect.objectContaining({ key: "maxConcurrency", source: "Framework default", resettable: false }),
      expect.objectContaining({ key: "maxRetriesPerAction", value: "4", source: "Flow override" })
    ]));
    const payload = buildFlowSettingsSavePayload(flow, { ...draft, timeoutSeconds: "30", llmProvider: "host", llmModel: "host-default", maxRetriesPerAction: "1" });
    expect(payload.executionDefaults).not.toHaveProperty("timeoutMs");
    expect(payload.metadata).not.toHaveProperty("llmProvider");
    expect(payload.metadata.trainingModeSettings ?? {}).not.toHaveProperty("recoveryBudget");
    const html = renderToStaticMarkup(createElement(AutomationFlowSettingsWorkspace, { projectId: null, flow }));
    expect(html).toContain("Framework default");
    expect(html).toContain("Flow override");
    expect(html).toContain("Use Default");
    expect(html).toContain("Show Technical Metadata");
  });
  it("gives Flow Settings anchored navigation and one dirty-aware sticky footer", () => {
    expect(settingsDraftIsDirty({ name: "A" }, { name: "A" })).toBe(false);
    expect(settingsDraftIsDirty({ name: "B" }, { name: "A" })).toBe(true);
    const html = renderToStaticMarkup(createElement(AutomationFlowSettingsWorkspace, { projectId: null, flow: { flowId: "flow.checkout", name: "Checkout", metadata: {} } }));
    expect(html).toContain('aria-label="Flow settings sections"');
    expect(html).toContain('id="flow-settings-general"');
    expect(html).toContain('id="flow-settings-runtime"');
    expect(html).toContain('id="flow-settings-adaptation"');
    expect(html).toContain('id="flow-settings-limits"');
    expect(html).toContain("automation-settings-form-footer");
    expect(html).toContain("Discard Changes");
    expect(html).toContain("All Flow settings saved");
  });
  it("renders dedicated settings for a subflow graph instead of Flow training settings", () => {
    const html = renderToStaticMarkup(createElement(AutomationFlowSettingsWorkspace, {
      projectId: null,
      flow: {
        flowId: "flow.checkout.subflow.primary.graph",
        name: "Primary Graph",
        metadata: {
          subflowGraph: true,
          parentFlowId: "flow.checkout",
          parentSubflowId: "subflow.primary"
        }
      }
    }));

    expect(html).toContain("Subflow Settings");
    expect(AutomationFlowSettingsWorkspace.toString()).toContain("AutomationSubflowSettingsWorkspace");
    expect(html).toContain("routing, mappings, instructions, and approval behavior");
    expect(html).not.toContain("Flow Identity");
    expect(html).not.toContain("Training Mode");
    expect(html).not.toContain("Show Flow Settings JSON");
  });
  it("offers only valid adaptation lifecycle actions through an in-product authorization flow", () => {
    expect(adaptationReviewActions("proposed")).toEqual(["approve", "reject", "request_validation", "switch_manual"]);
    expect(adaptationReviewActions("validated")).toEqual(["apply", "reject", "disable", "supersede", "request_validation", "switch_manual"]);
    expect(adaptationReviewActions("applied")).toEqual(["revert"]);
    for (const terminal of ["rejected", "disabled", "reverted", "superseded"]) expect(adaptationReviewActions(terminal)).toEqual([]);
    expect(adaptationReviewCopy("supersede")).toMatchObject({ label: "Supersede", danger: true });
    const source = AutomationAdaptationsWorkspace.toString();
    expect(source).toContain("pendingReviewAction");
    expect(source).toContain("Replacement adaptation ID");
    expect(source).toContain("Enter a reason for this decision.");
    expect(source).not.toContain("window.prompt");
  });
  it("uses named typed Subflow mappings and validates boundary settings", () => {
    const parentInputs = [{ id: "flow.customer", name: "Customer email", valueType: { kind: "string" } }];
    const subflowInputs = [{ id: "subflow.customer", name: "Customer", valueType: { kind: "string" } }];
    const draft: any = subflowSettingsDraft({ name: "Checkout", status: "active", inputMapping: [{ flowInputId: "flow.customer", subflowInputId: "subflow.customer", required: true }], outputMapping: [], localInstructionIds: ["instruction.checkout"] });
    expect(draft.localInstructionIds).toEqual(["instruction.checkout"]);
    expect(subflowSettingsErrors(draft, parentInputs, [], subflowInputs, [])).toEqual([]);
    expect(subflowSettingsErrors({ ...draft, name: "", inputMapping: [{ flowInputId: "flow.customer", subflowInputId: "missing" }] }, parentInputs, [], subflowInputs, [])).toEqual(expect.arrayContaining(["Subflow name is required.", "Input mappings must choose existing named ports."]));
    const html = renderToStaticMarkup(createElement(SubflowMappingEditor, { title: "Input Mapping", leftLabel: "Flow input", rightLabel: "Subflow input", leftKey: "flowInputId", rightKey: "subflowInputId", leftOptions: parentInputs, rightOptions: subflowInputs, rows: draft.inputMapping, onChange: () => undefined }));
    expect(html).toContain("Customer email (Text)");
    expect(html).toContain("Customer (Text)");
    expect(html).toContain("<select");
    expect(html).not.toContain('<input value="flow.customer"');
    expect(AutomationFlowSettingsWorkspace.toString()).not.toContain("Local instruction IDs");
  });
  it("restores Settings deep links and uses in-product authorization", () => {
    expect(readSettingsSection("settingsSection=flow-settings-limits", "flow")).toBe("flow-settings-limits");
    expect(readSettingsSection("settingsSection=subflow-settings-outputs", "subflow")).toBe("subflow-settings-outputs");
    expect(readSettingsSection("settingsSection=unknown", "flow")).toBe("flow-settings-general");
    expect(AutomationTopLevelFlowSettingsWorkspace.toString()).not.toContain("window.prompt");
    expect(AutomationSubflowSettingsWorkspace.toString()).not.toContain("window.prompt");
    expect(AutomationTopLevelFlowSettingsWorkspace.toString()).toContain("expectedUpdatedAt");
    expect(AutomationSubflowSettingsWorkspace.toString()).toContain("expectedUpdatedAt");
  });
  it("shows the Router Flow dependency before route controls", () => {
    const html = renderToStaticMarkup(createElement(AutomationFlowMapWorkspace, { projectId: null, flow: null }));
    expect(html).toContain("Select a Flow to edit its Router");
    expect(html).toContain("Router rules belong to one top-level Flow");
    expect(html).not.toContain("New Route");
  });
  it("orders Router rows by priority and then stable route name", () => {
    const routes = flowMapRoutes({ rules: [
      { ruleId: "b", name: "Beta", order: 20 },
      { ruleId: "c", name: "Checkout", order: 10 },
      { ruleId: "a", name: "Account", order: 10 }
    ] });
    expect(routes.map((route) => route.ruleId)).toEqual(["a", "c", "b"]);
  });
  it("renders populated Router routes as one ordered workspace", () => {
    const html = renderToStaticMarkup(createElement(AutomationFlowMapWorkspace, {
      projectId: null,
      flow: { flowId: "flow.checkout", name: "Checkout" },
      initialSubflows: [
        { subflowId: "subflow.refund", name: "Refund request", status: "active" },
        { subflowId: "subflow.checkout", name: "Checkout", status: "active" }
      ],
      initialRouter: {
        name: "Checkout Router",
        metadata: { routeGroups: [{ groupId: "billing", name: "Billing", order: 10 }] },
        rules: [{
          ruleId: "route.refund",
          name: "Handle refund",
          order: 10,
          status: "active",
          metadata: { groupId: "billing", conditionSummary: "Customer asks for a refund" },
          target: { kind: "subflow", subflowId: "subflow.refund" }
        }],
        fallback: { kind: "subflow", subflowId: "subflow.checkout" }
      }
    }));

    expect(html).toContain("automation-router-workbench");
    expect(html).toContain("automation-router-route-status");
    expect(html).toContain("Priority 10: Handle refund to Refund request");
    expect(html).toContain("Route and condition");
    expect(html).toContain("Handle refund");
    expect(html).toContain("Customer asks for a refund");
    expect(html).toContain("Refund request");
    expect(html).toContain("Billing");
    expect(html).toContain("Fallback");
    expect(html).toContain("Checkout");
    expect(html).not.toContain("Decision Map");
    expect(html).not.toContain("Route List");
    expect(html).not.toContain("Route Inspector");
    expect(html).not.toContain("Advanced Flow Map Details");
  });
  it("bounds large Router collections to 100 mounted route rows", () => {
    const html = renderToStaticMarkup(createElement(AutomationFlowMapWorkspace, {
      projectId: null,
      flow: { flowId: "flow.large", name: "Large" },
      initialSubflows: [{ subflowId: "subflow.target", name: "Target", status: "active" }],
      initialRouter: {
        rules: Array.from({ length: 101 }, (_, index) => ({
          ruleId: "route." + index,
          name: "Route " + index,
          order: index,
          status: "active",
          target: { kind: "subflow", subflowId: "subflow.target" }
        }))
      }
    }));

    expect((html.match(/automation-router-route-row"/g) ?? []).length).toBe(100);
    expect(html).toContain("1-100 of 101 routes");
    expect(html).toContain("Next");
  });
  it("restores bounded Instruction filters and renders bottom pagination", () => {
    expect(readInstructionDirectoryUrlState("instructionQuery=checkout&instructionScope=on_error&instructionStatus=active&instructionRequirement=required&instructionSort=priority&instructionDirection=asc&instructionPageSize=50&instructionOffset=100")).toMatchObject({ search: "checkout", scopeKind: "on_error", status: "active", requirement: "required", sort: "priority", direction: "asc", limit: 50, offset: 100 });
    expect(readInstructionDirectoryUrlState("instructionPageSize=100").limit).toBe(25);
    const html = renderToStaticMarkup(createElement(AutomationInstructionsWorkspace, { projectId: null, flow: { flowId: "flow.checkout" } }));
    expect(html).toContain("Search instructions");
    expect(html).toContain("All scopes");
    expect(html).toContain("All requirements");
    expect(html).toContain("Instructions per page");
    expect(html).toContain("First instruction page");
    expect(html).toContain("Last instruction page");
  });

  it("preserves instruction drafts and guards dirty editor navigation", () => {
    const base = { instructionId: "", title: "", body: "", scopeKind: "flow", routerId: "", subflowId: "", nodeId: "", errorTargetKind: "flow" as const, priority: 50, requirement: "advisory", status: "active" };
    expect(instructionDraftStorageKey("project.one", "flow.checkout", "instruction.refunds")).toBe("fluxiq:instruction-draft:project.one:flow.checkout:instruction.refunds");
    expect(instructionDraftStorageKey("project.one", "flow.checkout")).toBe("fluxiq:instruction-draft:project.one:flow.checkout:new");
    expect(instructionDraftIsDirty(base, base)).toBe(false);
    expect(instructionDraftIsDirty({ ...base, body: "Require an order number." }, base)).toBe(true);

    const source = AutomationInstructionsWorkspace.toString();
    expect(source).toContain("saveInstructionDraftToLocalStorage");
    expect(source).toContain("beforeunload");
    expect(source).toContain("Unsaved Instruction Changes");
    expect(source).toContain("Recovered local draft");
    expect(source).toContain("automation-instruction-content-section");
    expect(source).toContain("automation-instruction-behavior-section");
  });

  it("removes oversized instruction recovery drafts before parsing", () => {
    const originalWindow = globalThis.window;
    const values = new Map<string, string>();
    const key = instructionDraftStorageKey("project.one", "flow.checkout");
    const fakeWindow = {
      localStorage: {
        getItem: (storageKey: string) => values.get(storageKey) ?? null,
        setItem: (storageKey: string, value: string) => { values.set(storageKey, value); },
        removeItem: (storageKey: string) => { values.delete(storageKey); }
      }
    } as any;
    Object.defineProperty(globalThis, "window", { configurable: true, value: fakeWindow });
    try {
      values.set(key, "{" + " ".repeat(INSTRUCTION_DRAFT_MAX_LOCAL_STORAGE_CHARS) + "}");
      expect(readStoredInstructionDraft(key)).toBeNull();
      expect(values.has(key)).toBe(false);
    } finally {
      Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
    }
  });
  it("uses named object pickers and validates scoped instruction targets", () => {
    const base = { instructionId: "", title: "Rule", body: "Do the thing", scopeKind: "flow", routerId: "", subflowId: "", nodeId: "", errorTargetKind: "flow" as const, priority: 50, requirement: "advisory", status: "active" };
    expect(instructionScopeTargetError(base)).toBe("");
    expect(instructionScopeTargetError({ ...base, scopeKind: "router" })).toBe("Choose the Flow Router.");
    expect(instructionScopeTargetError({ ...base, scopeKind: "subflow" })).toBe("Choose a subflow.");
    expect(instructionScopeTargetError({ ...base, scopeKind: "node" })).toBe("Choose a node.");
    expect(instructionScopeTargetError({ ...base, scopeKind: "on_error", errorTargetKind: "node" })).toContain("node whose errors");
    const source = AutomationInstructionsWorkspace.toString();
    expect(source).toContain(".Combobox");
    expect(source).toContain("Search subflows");
    expect(source).toContain("Search nodes");
    expect(source).toContain("All projects and Flows");
    expect(source).toContain("routerId: draftInstruction.routerId");
  });
  it("maps instruction importance and provides practical starter templates", () => {
    expect(instructionPriorityForImportance("low")).toBe(25);
    expect(instructionPriorityForImportance("normal")).toBe(50);
    expect(instructionPriorityForImportance("high")).toBe(75);
    expect(instructionPriorityForImportance("critical")).toBe(90);
    expect(instructionImportance(63)).toBe("custom");
    expect(INSTRUCTION_TEMPLATES.map((template) => template.id)).toEqual(expect.arrayContaining(["flow-goal", "safety-constraint", "error-recovery", "router-guidance", "subflow-rule", "node-guidance", "review-criteria"]));
    const source = AutomationInstructionsWorkspace.toString();
    expect(source).toContain("Apply Template");
    expect(source).toContain("Fine-tune priority");
    expect(source).toContain("Required guidance is treated as a runtime constraint");
    expect(source).toContain("aria-pressed");
  });
  it("orders effective instructions like runtime precedence and exposes real inner views", () => {
    const ordered = effectiveInstructionOrder([
      { instructionId: "disabled", status: "disabled", priority: 100, updatedAt: 1, scope: { kind: "global" } },
      { instructionId: "node", status: "active", priority: 90, updatedAt: 1, scope: { kind: "node" } },
      { instructionId: "flow-low", status: "active", priority: 25, updatedAt: 1, scope: { kind: "flow" } },
      { instructionId: "global", status: "active", priority: 50, updatedAt: 1, scope: { kind: "global" } },
      { instructionId: "flow-high", status: "active", priority: 75, updatedAt: 2, scope: { kind: "flow" } }
    ]);
    expect(ordered.map((instruction) => instruction.instructionId)).toEqual(["global", "flow-high", "flow-low", "node"]);
    const html = renderToStaticMarkup(createElement(AutomationInstructionsWorkspace, { projectId: null, flow: { flowId: "flow.checkout", name: "Checkout", nodes: [] } }));
    expect(html).toContain('role="tablist"');
    expect(html).toContain("Library");
    expect(html).toContain("Editor");
    expect(html).toContain("Effective Preview");
    expect(html).toContain("How the runtime reads this guidance");
    expect(html).toContain("No active instructions apply");
  });
  it("diagnoses conflicts, duplicates, shadowing, and token pressure", () => {
    const scope = { kind: "flow", projectId: "project.one", flowId: "flow.one" };
    const instructions = [
      { instructionId: "high", title: "Safety", body: "Always verify the account. " + "x".repeat(3300), scope, status: "active", requirement: "required", priority: 90 },
      { instructionId: "low", title: "Safety", body: "Never verify the account.", scope, status: "active", requirement: "required", priority: 25 },
      { instructionId: "duplicate-a", title: "First copy", body: "Keep state stable.", scope, status: "active", requirement: "advisory", priority: 50 },
      { instructionId: "duplicate-b", title: "Second copy", body: " keep   state stable. ", scope, status: "active", requirement: "advisory", priority: 50 }
    ];
    const codes = instructionDiagnostics(instructions, 100).map((diagnostic) => diagnostic.code);
    expect(codes).toEqual(expect.arrayContaining(["instruction.conflict", "instruction.duplicate", "instruction.shadowed", "instruction.large", "instruction.token_budget"]));
    expect(estimateInstructionTokens({ title: "1234", body: "5678" })).toBe(2);
    const source = AutomationInstructionsWorkspace.toString();
    expect(source).toContain("Draft Checks");
    expect(source).toContain("Effective Set Checks");
    expect(source).toContain("Estimated instruction tokens");
    expect(source).toContain("Instruction context");
  });
  it("uses in-product authorization, explicit save state, and readiness actions", () => {
    const source = AutomationInstructionsWorkspace.toString();
    expect(source).not.toContain("window.prompt");
    expect(source).toContain("Authorize Instruction Save");
    expect(source).toContain("Security PIN");
    expect(source).toContain("Save Instruction");
    expect(source).toContain("Discard Changes");
    expect(source).toContain("fluxiq:instructions-changed");
    const html = renderToStaticMarkup(createElement(AutomationInstructionsWorkspace, { projectId: null, flow: { flowId: "flow.checkout", name: "Checkout", nodes: [] } }));
    expect(html).toContain("This Flow needs guidance before its first run");
    expect(html).toContain("Create Instruction");
    expect(html).toContain("Browse Templates");
    expect(html).toContain("All changes saved");
  });
  it("renders Router, instructions, adaptations, and settings as first-class Flow views", () => {
    const flow = { flowId: "flow.checkout", metadata: { trainingMode: "normal", proposalMode: "auto" } };
    const views = [
      renderToStaticMarkup(createElement(AutomationFlowMapWorkspace, { projectId: null, flow })),
      renderToStaticMarkup(createElement(AutomationInstructionsWorkspace, { projectId: null, flow })),
      renderToStaticMarkup(createElement(AutomationAdaptationsWorkspace, { projectId: null, flow })),
      renderToStaticMarkup(createElement(AutomationFlowSettingsWorkspace, { projectId: null, flow }))
    ].join("\n");

    expect(views).toContain("Router");
    expect(views).toContain("This Flow needs a subflow");
    expect(views).toContain("Router rules send each run to a subflow target.");
    expect(views).toContain("Create Subflow");
    expect(views).toContain("automation-router-empty-state");
    expect(views).not.toContain("automation-router-first-use-visual");
    expect(views).toContain("Instructions");
    expect(views).toContain("Adaptations");
    expect(views).toContain("Settings");
    expect(views).toContain("Effective Values");
    expect(views).toContain("New");
    expect(views).toContain("Instruction Editor");
    expect(views).toContain("automation-instructions-workspace");
    expect(views).toContain("automation-instruction-editor-sections");
    expect(views).toContain("Save");
  });

  it("keeps Router fallback and route-group lifecycle editing explicit", () => {
    const source = AutomationFlowMapWorkspace.toString();
    expect(source).toContain("Fallback Behavior");
    expect(source).toContain("Save Fallback");
    expect(source).toContain("save-flow-map-fallback");
    expect(source).toContain("groupDraft.status");
    expect(source).toContain("Stop the run");
  });
  it("builds friendly typed Router conditions without raw JSON", () => {
    expect(flowMapConditionDraft({ signalPath: "state.cart.total", operator: "greater_than", expected: 25 })).toMatchObject({
      conditionMode: "when",
      conditionSource: "state",
      conditionField: "cart.total",
      conditionValueType: "number",
      conditionExpected: "25"
    });
    const draft = {
      ruleId: "", name: "", description: "", targetSubflowId: "", order: 0, status: "active", groupId: "", confidence: 1,
      conditionMode: "when", conditionSource: "inputs", conditionField: "approved", conditionOperator: "equals", conditionValueType: "boolean", conditionExpected: "true", setAsFallback: false
    };
    expect(flowMapConditionExpected(draft)).toBe(true);
    expect(flowMapConditionSummary(draft)).toBe("Run input approved equals true");
    const source = AutomationFlowMapWorkspace.toString();
    expect(source).toContain("Match behavior");
    expect(source).toContain("Run input");
    expect(source).toContain("Current state");
    expect(source).not.toContain("Advanced matching");
  });
  it("uses the shared searchable subflow picker for route and fallback targets", () => {
    const source = AutomationFlowMapWorkspace.toString();
    expect(source).toContain("Search subflows");
    expect(source).toContain("subflowOptions");
    expect(source).toContain("Choose a target subflow");
    expect(source).toContain("Choose a fallback subflow");
    expect(source).not.toContain("<option value=\"\">Select target</option>");
  });
  it("exposes compact authorized actions for every Router row", () => {
    const source = AutomationFlowMapWorkspace.toString();
    expect(source).toContain("Actions for ");
    expect(source).toContain("Move up");
    expect(source).toContain("Move down");
    expect(source).toContain("Duplicate route");
    expect(source).toContain("Disable route");
    expect(source).toContain("Enable route");
    expect(source).toContain("Delete route");
    expect(source).toContain("mutate-flow-map-route");
  });
  it("tests a route with the canonical evaluator and explains the result", () => {
    const draft = {
      ruleId: "", name: "High value", description: "", targetSubflowId: "subflow.review", order: 0, status: "active", groupId: "", confidence: 1,
      conditionMode: "when", conditionSource: "state", conditionField: "cart.total", conditionOperator: "greater_than", conditionValueType: "number", conditionExpected: "25", setAsFallback: false
    };
    expect(buildFlowMapRouteTestPayload(draft, "30")).toEqual({
      condition: { signalPath: "state.cart.total", operator: "greater_than", expected: 25 },
      currentStateSummary: { cart: { total: 30 } }
    });
    expect(buildFlowMapRouteTestPayload({ ...draft, conditionMode: "always" }, "")).toEqual({});
    const source = AutomationFlowMapWorkspace.toString();
    expect(source).toContain("Test this route");
    expect(source).toContain("Test condition");
    expect(source).toContain("Route does not match");
    expect(source).toContain("test-flow-map-route-condition");
  });
  it("keeps Router loading, failures, saves, and authorization explicit", () => {
    const source = AutomationFlowMapWorkspace.toString();
    expect(source).toContain("Loading Router routes");
    expect(source).toContain("Retry");
    expect(source).toContain("Saving changes");
    expect(source).toContain("Authorize Router Change");
    expect(source).toContain("scopeRef.current");
  });
  it("restores Subflow directory filters and pagination from URL state", () => {
    expect(readSubflowDirectoryUrlState("?subflowQuery=checkout&subflowStatus=active&subflowRole=primary&subflowSort=name&subflowDirection=asc&subflowPageSize=50&subflowOffset=100")).toEqual({
      search: "checkout",
      status: "active",
      role: "primary",
      sort: "name",
      direction: "asc",
      limit: 50,
      offset: 100
    });
  });
  it("exposes focused Subflow lifecycle actions without embedding an editor", () => {
    const source = AutomationSubflowsWorkspace.toString();
    expect(source).toContain("Rename subflow");
    expect(source).toContain("Duplicate subflow");
    expect(source).toContain("Disable subflow");
    expect(source).toContain("Enable subflow");
    expect(source).toContain("Archive subflow");
    expect(source).toContain("Delete subflow");
    expect(source).toContain("independent Nodes graph");
    expect(source).toContain("Router references must be removed first");
    expect(source).toContain("Security PIN");
  });});
