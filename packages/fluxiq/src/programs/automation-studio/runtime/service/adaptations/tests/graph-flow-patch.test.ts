import { describe, expect, it } from "vitest";
import { createBlankAutomationStudioFlowArtifact, type AutomationStudioFlowAdaptation, type AutomationStudioFlowArtifact } from "../../../../model/index.ts";
import { automationStudioGraphFlowWithAdaptationPatch } from "../graph-flow-patch.ts";

// The file-based apply writes a node patch with this function, as the typed
// graph transaction writes it with `set_node_metadata`: a node the change wrote
// lists the change, so a later run's attempt on it names what it exercised.

type Patch = AutomationStudioFlowAdaptation["patch"][number];

function graph(): AutomationStudioFlowArtifact {
  const flow = createBlankAutomationStudioFlowArtifact({ flowId: "flow.graph", projectId: "project.graph", name: "Graph", now: 1 });
  flow.nodes = [
    { id: "expect.ready", definitionId: "builtin.policy.expectation", parameterValues: { timeoutMs: 100 }, metadata: { adaptationIds: ["adaptation.earlier"], note: "kept" } },
    { id: "action.submit", definitionId: "builtin.policy.action", parameterValues: { parameters: { target: { selector: "#old" } } } },
    { id: "end", definitionId: "builtin.control.end", parameterValues: {} }
  ];
  return flow;
}

const adaptation = { adaptationId: "adaptation.current", sourceRunId: "run.source" };

describe("automationStudioGraphFlowWithAdaptationPatch", () => {
  it("stamps a node an action target patch wrote with the adaptation id", () => {
    const patch: Patch = { kind: "edit_action_target", targetId: "action.submit", summary: "New target.", after: { selector: "#new" } };
    const after = automationStudioGraphFlowWithAdaptationPatch(graph(), adaptation, patch, 50);
    const node = after.nodes.find((item) => item.id === "action.submit");
    expect(node?.parameterValues).toMatchObject({ parameters: { target: { selector: "#new" } } });
    expect(node?.metadata).toEqual({ adaptationIds: ["adaptation.current"] });
  });

  it("appends the id to an expectation node's list, keeping its other metadata", () => {
    const patch: Patch = { kind: "edit_expectation", targetId: "expect.ready", summary: "Wait longer.", after: { timeoutMs: 500 } };
    const after = automationStudioGraphFlowWithAdaptationPatch(graph(), adaptation, patch, 50);
    expect(after.nodes.find((item) => item.id === "expect.ready")?.metadata).toEqual({ adaptationIds: ["adaptation.earlier", "adaptation.current"], note: "kept" });
  });

  it("leaves the graph it was given and every node the patch did not write unchanged", () => {
    const before = graph();
    const snapshot = structuredClone(before);
    const patch: Patch = { kind: "edit_action_target", targetId: "action.submit", summary: "New target.", after: { selector: "#new" } };
    const after = automationStudioGraphFlowWithAdaptationPatch(before, adaptation, patch, 50);
    expect(before).toEqual(snapshot);
    expect(after.nodes.find((item) => item.id === "end")).toEqual(snapshot.nodes.find((item) => item.id === "end"));
  });

  it("stamps no node for a reroute, whose edge already names the adaptation", () => {
    const patch: Patch = { kind: "edit_router", targetId: "action.submit", summary: "Route failures to the end.", after: { toNodeId: "end" } };
    const after = automationStudioGraphFlowWithAdaptationPatch(graph(), adaptation, patch, 50);
    expect(after.nodes).toEqual(graph().nodes);
    expect(after.edges).toEqual([expect.objectContaining({ sourceNodeId: "action.submit", targetNodeId: "end", metadata: { adaptationId: "adaptation.current" } })]);
  });
});
