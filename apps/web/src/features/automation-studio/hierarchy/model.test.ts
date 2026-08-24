import { describe, expect, it } from "vitest";
import { automationHierarchyNodeCanDelete, automationHierarchyNodeIsGeneratedFlowStructure, flowHierarchyNodes, proposalHierarchyNodes } from "./model";

describe("proposalHierarchyNodes", () => {
  it("groups proposal attempts under their source recording folder", () => {
    const nodes = proposalHierarchyNodes([
      { recordingId: "recording.one", startedAt: 1, metadata: { clientName: "Browser" } }
    ], [
      { proposalId: "proposal.direct", recordingId: "recording.one", metadata: { generationMode: "direct" } },
      { proposalId: "proposal.assisted", recordingId: "recording.one", metadata: { generationMode: "llm_assisted", title: "Clean checkout" } }
    ]);

    const client = nodes.find((node) => node.kind === "folder" && node.label === "Browser");
    const folder = nodes.find((node) => node.kind === "folder" && node.sourceId === "recording.one");
    const proposals = nodes.filter((node) => node.kind === "proposal");

    expect(client).toMatchObject({ kind: "folder", parentId: null });
    expect(folder).toMatchObject({ kind: "folder", parentId: client?.id, sourceId: "recording.one" });
    expect(proposals).toHaveLength(2);
    expect(proposals.every((node) => node.parentId === folder?.id)).toBe(true);
    expect(proposals.map((node) => node.label)).toContain("Clean checkout");
    expect(proposals.map((node) => node.label)).toContain("Direct: proposal.direct");
  });
});

describe("flowHierarchyNodes", () => {
  it("expands Flows into sidebar folders and Flow-owned object rows", () => {
    const nodes = flowHierarchyNodes([{
      source: "canonical",
      flow: {
        flowId: "flow.checkout",
        name: "Checkout",
        expansion: {
          routerId: "router.checkout",
          subflowIds: ["subflow.primary", "subflow.recovery"],
          instructionIds: ["instruction.global"],
          changeProposalIds: ["proposal.route"],
          adaptationIds: ["adaptation.wait"],
          runIds: ["run.1"]
        }
      }
    }], {
      recordings: [{ recordingId: "recording.checkout" }],
      proposals: [{ proposalId: "proposal.recording", recordingId: "recording.checkout" }]
    });
    const flow = nodes.find((node) => node.kind === "flow");
    const subflowsFolder = nodes.find((node) => node.kind === "folder" && node.label === "Subflows");
    const subflows = nodes.filter((node) => node.kind === "subflow");

    expect(flow).toMatchObject({ label: "Checkout", parentId: null, viewId: "policy-primary", sourceId: "flow.checkout" });
    expect(nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "flow-object", label: "Router", parentId: flow?.id, viewId: "flow-router", flowId: "flow.checkout" }),
      expect.objectContaining({ kind: "flow-object", label: "Instructions", parentId: flow?.id, viewId: "flow-instructions", flowId: "flow.checkout" }),
      expect.objectContaining({ kind: "folder", label: "Recordings", parentId: flow?.id, viewId: "timeline-recording", flowId: "flow.checkout" }),
      expect.objectContaining({ kind: "folder", label: "Adaptations", parentId: flow?.id, viewId: "adaptations", flowId: "flow.checkout" }),
      expect.objectContaining({ kind: "folder", label: "Runs", parentId: flow?.id, viewId: "runs-history", flowId: "flow.checkout" }),
      expect.objectContaining({ kind: "flow-object", label: "Settings", parentId: flow?.id, viewId: "flow-settings", flowId: "flow.checkout" })
    ]));
    expect(nodes.some((node) => node.label === "Change Proposals")).toBe(false);
    expect(nodes.some((node) => node.label === "Proposals")).toBe(false);
    expect(nodes.some((node) => node.label === "Config" || node.viewId === "config-default")).toBe(false);
    expect(nodes.some((node) => node.label === "State" || node.viewId === "state-explorer")).toBe(false);
    expect(nodes.filter((node) => node.kind === "recording")).toEqual([expect.objectContaining({ sourceId: "recording.checkout", flowId: "flow.checkout" })]);
    expect(nodes.filter((node) => node.kind === "proposal")).toEqual([]);
    expect(nodes.filter((node) => node.kind === "change-proposal")).toEqual([]);
    expect(nodes.filter((node) => node.kind === "adaptation")).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: "adaptation.wait", viewId: "adaptations", flowId: "flow.checkout" }),
      expect.objectContaining({ sourceId: "proposal.recording", viewId: "adaptations", flowId: "flow.checkout" }),
      expect.objectContaining({ sourceId: "proposal.route", viewId: "adaptations", flowId: "flow.checkout" })
    ]));
    expect(nodes.filter((node) => node.kind === "adaptation").every((node) => node.parentId === nodes.find((candidate) => candidate.kind === "folder" && candidate.label === "Adaptations")?.id)).toBe(true);
    expect(subflowsFolder).toMatchObject({ parentId: flow?.id, viewId: "policy-primary", flowId: "flow.checkout" });
    expect(subflows).toHaveLength(2);
    expect(subflows.every((node) => node.parentId === subflowsFolder?.id && node.flowId === "flow.checkout")).toBe(true);
  });

  it("distinguishes protected Flow structure from deletable Flow category objects", () => {
    const nodes = flowHierarchyNodes([{
      source: "canonical",
      flow: {
        flowId: "flow.checkout",
        name: "Checkout",
        expansion: {
          subflowIds: ["subflow.primary"],
          runIds: ["run.1"]
        }
      }
    }]);

    const settings = nodes.find((node) => node.label === "Settings");
    const subflowsFolder = nodes.find((node) => node.label === "Subflows");
    const subflow = nodes.find((node) => node.kind === "subflow");
    const run = nodes.find((node) => node.kind === "run");

    expect(settings && automationHierarchyNodeIsGeneratedFlowStructure(settings)).toBe(true);
    expect(subflowsFolder && automationHierarchyNodeIsGeneratedFlowStructure(subflowsFolder)).toBe(true);
    expect(settings && automationHierarchyNodeCanDelete(settings)).toBe(false);
    expect(subflowsFolder && automationHierarchyNodeCanDelete(subflowsFolder)).toBe(false);
    expect(subflow && automationHierarchyNodeCanDelete(subflow)).toBe(true);
    expect(run && automationHierarchyNodeCanDelete(run)).toBe(true);
  });
});
