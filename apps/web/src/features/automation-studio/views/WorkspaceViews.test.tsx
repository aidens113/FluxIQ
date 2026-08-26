import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AutomationAdaptationsWorkspace, AutomationFlowSettingsWorkspace, AutomationInstructionsWorkspace, AutomationFlowMapWorkspace, AutomationRuntimeWorkspace, AutomationSubflowsWorkspace, RuntimeActionLogPage, RuntimeAttemptRow, RuntimePostRunSummary, adaptationReviewHref, buildAutomationRuntimeRunPayload, routerReferencesForSubflow, runtimeAttemptsForRunDetail, sortRuntimeRunsForDebugView } from "./WorkspaceViews";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams()
}));

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
      }
    }));

    expect(html).toContain("automation-runtime-attempt-row");
    expect(html).toContain("#1");
    expect(html).toContain("submit");
    expect(html).toContain("Details JSON");
    expect(html).not.toContain("Inputs JSON");
    expect(html).not.toContain("Outputs JSON");
    expect(html).not.toContain("automation-runtime-attempt-card");
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
    expect(html).toContain("Run Story");
    expect(html).toContain("LLM Interventions");
    expect(html).toContain("FluxIQ created adaptation evidence for review.");
    expect(html).toContain("automation-runtime-attempt-row");
    expect(html).not.toContain("until-expanded");
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
    expect(runtimeHtml).toContain("Mode");
    expect(runtimeHtml).toContain("Fully adaptive");
    expect(runtimeHtml).toContain("Require manual approval");
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
    expect(settingsHtml).toContain("Runtime Safety");
    expect(settingsHtml).toContain("Adaptations");
    expect(settingsHtml).toContain("Policy preset");
    expect(settingsHtml).toContain("Adaptation approval");
    expect(settingsHtml).toContain("Auto-apply low-risk fixes");
    expect(settingsHtml).toContain("Require first manual review");
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
    expect(settingsHtml).toContain("Show Flow Settings JSON");
    expect(settingsHtml).not.toContain("should-not-render-until-expanded");
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

    expect(html).toContain("Adaptations");
    expect(html).toContain("Training Status");
    expect(html).toContain("proposed");
    expect(html).toContain("validated");
    expect(html).toContain("Select a Flow to review adaptations.");
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
    expect(html).toContain("Save Subflow Settings");
    expect(html).toContain("routing, mappings, instructions, and approval behavior");
    expect(html).not.toContain("Flow Identity");
    expect(html).not.toContain("Training Mode");
    expect(html).not.toContain("Show Flow Settings JSON");
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
  it("renders Router, instructions, adaptations, and settings as first-class Flow views", () => {
    const flow = { flowId: "flow.checkout", metadata: { trainingMode: "normal", proposalMode: "auto" } };
    const views = [
      renderToStaticMarkup(createElement(AutomationFlowMapWorkspace, { projectId: null, flow })),
      renderToStaticMarkup(createElement(AutomationInstructionsWorkspace, { projectId: null, flow })),
      renderToStaticMarkup(createElement(AutomationAdaptationsWorkspace, { projectId: null, flow })),
      renderToStaticMarkup(createElement(AutomationFlowSettingsWorkspace, { projectId: null, flow }))
    ].join("\n");

    expect(views).toContain("Router");
    expect(views).toContain("Router setup");
    expect(views).toContain("Add your first subflow");
    expect(views).toContain("Create subflow");
    expect(views).toContain("automation-router-first-use");
    expect(views).toContain("Instructions");
    expect(views).toContain("Adaptations");
    expect(views).toContain("Settings");
    expect(views).toContain("Instruction precedence");
    expect(views).toContain("New");
    expect(views).toContain("Instruction Editor");
    expect(views).toContain("automation-instructions-workspace");
    expect(views).toContain("automation-instruction-editor-card");
    expect(views).toContain("Save");
  });
});
