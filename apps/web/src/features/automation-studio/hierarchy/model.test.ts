import { describe, expect, it } from "vitest";
import { automationHierarchyNodeCanCreateChildFolder, automationHierarchyNodeCanDelete, automationHierarchyNodeIsGeneratedFlowStructure, flowHierarchyNodes, proposalHierarchyNodes } from "./model";

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
          subflowIds: [{ subflowId: "subflow.primary", name: "Primary checkout" }, "subflow.recovery"],
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
      expect.objectContaining({ kind: "flow-object", label: "Instructions", parentId: flow?.id, viewId: "flow-instructions", flowId: "flow.checkout" }),
      expect.objectContaining({ kind: "folder", label: "Recordings", parentId: flow?.id, viewId: "timeline-recording", flowId: "flow.checkout" }),
      expect.objectContaining({ kind: "folder", label: "Adaptations", parentId: flow?.id, viewId: "adaptations", flowId: "flow.checkout" }),
      expect.objectContaining({ kind: "folder", label: "Runs", parentId: flow?.id, viewId: "runs-history", flowId: "flow.checkout" }),
      expect.objectContaining({ kind: "flow-object", label: "Settings", parentId: flow?.id, viewId: "flow-settings", flowId: "flow.checkout" })
    ]));
    expect(nodes).toContainEqual(expect.objectContaining({ label: "Router", viewId: "flow-router", kind: "flow-object" }));
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
    expect(nodes.filter((node) => node.kind === "adaptation").every((node) => node.parentId === nodes.find((candidate) => candidate.kind === "folder" && candidate.label === "Adaptations" && candidate.flowId === "flow.checkout")?.id)).toBe(true);
    expect(subflowsFolder).toMatchObject({ parentId: flow?.id, viewId: "flow-subflows", flowId: "flow.checkout" });
    expect(subflows).toHaveLength(2);
    expect(subflows.map((node) => node.label)).toContain("Primary checkout");
    expect(subflows.every((node) => node.parentId === subflowsFolder?.id && node.viewId === "policy-primary" && node.flowId === "flow.checkout" && typeof node.metadata?.graphFlowId === "string")).toBe(true);
  });


  it("links subflow rows to backing graph Flows without exposing those graphs at the top level", () => {
    const nodes = flowHierarchyNodes([
      {
        source: "canonical",
        flow: {
          flowId: "flow.checkout",
          name: "Checkout",
          expansion: { subflowIds: ["subflow.primary"] }
        }
      },
      {
        source: "canonical",
        flow: {
          flowId: "flow.checkout.custom-subflow-graph",
          name: "Primary",
          metadata: {
            subflowGraph: true,
            parentFlowId: "flow.checkout",
            parentSubflowId: "subflow.primary"
          }
        }
      }
    ]);

    const subflow = nodes.find((node) => node.kind === "subflow");
    expect(subflow).toMatchObject({
      label: "Primary",
      sourceId: "subflow.primary",
      flowId: "flow.checkout",
      viewId: "policy-primary",
      metadata: { graphFlowId: "flow.checkout.custom-subflow-graph" }
    });
    expect(nodes.some((node) => node.kind === "flow" && node.sourceId === "flow.checkout.custom-subflow-graph")).toBe(false);
    expect(subflow?.metadata).toMatchObject({ hierarchyContainer: true, defaultCollapsed: true });
    expect(nodes.filter((node) => node.viewId === "flow-router")).toEqual([
      expect.objectContaining({ label: "Router", parentId: nodes.find((node) => node.kind === "flow")?.id, flowId: "flow.checkout" })
    ]);
    expect(nodes.some((node) => node.viewId === "flow-router" && node.parentId === subflow?.id)).toBe(false);
    expect(nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: "Nodes",
        parentId: subflow?.id,
        viewId: "policy-primary",
        sourceId: "flow.checkout.custom-subflow-graph",
        flowId: "flow.checkout.custom-subflow-graph",
        metadata: { flowStructure: "subflow-nodes" }
      }),
      expect.objectContaining({
        label: "Settings",
        parentId: subflow?.id,
        viewId: "flow-settings",
        sourceId: "flow.checkout.custom-subflow-graph",
        flowId: "flow.checkout.custom-subflow-graph"
      })
    ]));
  });
  it("renders recursive user-created subflow categories under the generated Subflows folder", () => {
    const nodes = flowHierarchyNodes([{
      source: "canonical",
      flow: {
        flowId: "flow.checkout",
        name: "Checkout",
        metadata: {
          subflowCategories: [
            { id: "subflow-category.checkout", name: "Checkout Steps", parentId: null, createdAt: 1, updatedAt: 1 },
            { id: "subflow-category.checkout.errors", name: "Error Paths", parentId: "subflow-category.checkout", createdAt: 2, updatedAt: 2 }
          ]
        },
        expansion: { subflowIds: ["subflow.primary"] }
      }
    }]);

    const subflowsFolder = nodes.find((node) => node.kind === "folder" && node.label === "Subflows");
    const parentCategory = nodes.find((node) => node.kind === "folder" && node.sourceId === "subflow-category.checkout");
    const nestedCategory = nodes.find((node) => node.kind === "folder" && node.sourceId === "subflow-category.checkout.errors");

    expect(parentCategory).toMatchObject({ label: "Checkout Steps", parentId: subflowsFolder?.id, flowId: "flow.checkout" });
    expect(nestedCategory).toMatchObject({ label: "Error Paths", parentId: parentCategory?.id, flowId: "flow.checkout" });
    expect(subflowsFolder && automationHierarchyNodeCanCreateChildFolder(subflowsFolder)).toBe(true);
    expect(parentCategory && automationHierarchyNodeCanCreateChildFolder(parentCategory)).toBe(true);
    expect(nestedCategory && automationHierarchyNodeCanCreateChildFolder(nestedCategory)).toBe(true);
    expect(parentCategory && automationHierarchyNodeIsGeneratedFlowStructure(parentCategory)).toBe(false);
    expect(parentCategory && automationHierarchyNodeCanDelete(parentCategory)).toBe(true);
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
