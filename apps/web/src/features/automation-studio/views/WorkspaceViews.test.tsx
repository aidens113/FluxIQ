import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AutomationAdaptationsWorkspace, AutomationFlowSettingsWorkspace, AutomationInstructionsWorkspace, AutomationRouterWorkspace, AutomationRuntimeWorkspace, RuntimeAttemptRow, routerReferencesForSubflow, runtimeAttemptsForRunDetail, sortRuntimeRunsForDebugView } from "./WorkspaceViews";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams()
}));

describe("Automation Runtime workspace", () => {
  it("renders the previous runs inner view with a button to open the event log", () => {
    const html = renderToStaticMarkup(
      createElement(AutomationRuntimeWorkspace, {
        projectId: "project.debug",
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
    expect(html).toContain("View Log");
    expect(html).toContain("run.debug.1");
    expect(html).toContain("flow:flow.checkout");
    expect(html).toContain("failed");
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

  it("keeps raw JSON opt-in and run lists paged", () => {
    const runtimeHtml = renderToStaticMarkup(
      createElement(AutomationRuntimeWorkspace, {
        projectId: "project.debug",
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

    expect(runtimeHtml).toContain("View Log");
    expect(runtimeHtml).toContain("1-1 of 1 runs");
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
    expect(settingsHtml).toContain("Modify router rules");
    expect(settingsHtml).toContain("Allow external side effects");
    expect(settingsHtml).toContain("LLM Budget");
    expect(settingsHtml).toContain("value=\"host\"");
    expect(settingsHtml).toContain("value=\"policy.default\"");
    expect(settingsHtml).toContain("value=\"12000\"");
    expect(settingsHtml).not.toContain("summary-strip");
    expect(settingsHtml).toContain("Show Flow Settings JSON");
    expect(settingsHtml).not.toContain("should-not-render-until-expanded");
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

  it("renders router, instructions, adaptations, and settings as first-class Flow views", () => {
    const flow = { flowId: "flow.checkout", metadata: { trainingMode: "normal", proposalMode: "auto" } };
    const views = [
      renderToStaticMarkup(createElement(AutomationRouterWorkspace, { projectId: null, flow })),
      renderToStaticMarkup(createElement(AutomationInstructionsWorkspace, { projectId: null, flow })),
      renderToStaticMarkup(createElement(AutomationAdaptationsWorkspace, { projectId: null, flow })),
      renderToStaticMarkup(createElement(AutomationFlowSettingsWorkspace, { projectId: null, flow }))
    ].join("\n");

    expect(views).toContain("Router");
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
