import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AutomationRuntimeWorkspace } from "./WorkspaceViews";

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
});
