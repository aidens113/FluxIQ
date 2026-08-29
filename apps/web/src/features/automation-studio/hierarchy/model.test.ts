import { describe, expect, it } from "vitest";
import type { AutomationHierarchyNode } from "./model";
import { automationHierarchyNodeCanCreateChildFolder, automationHierarchyNodeCanDelete, automationHierarchyNodeIsGeneratedFlowStructure, flowHierarchyNodes, indexAutomationHierarchyNodes, visibleAutomationHierarchyNodeIds } from "./model";

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
          recordingIds: ["recording.checkout"],
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

    expect(flow).toMatchObject({ label: "Checkout", parentId: null, viewId: "flow-nodes", sourceId: "flow.checkout" });
    expect(nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "flow-object", label: "Instructions", parentId: flow?.id, viewId: "flow-instructions", flowId: "flow.checkout" }),
      expect.objectContaining({ kind: "folder", label: "Recordings", parentId: flow?.id, viewId: "timeline-recording", flowId: "flow.checkout" }),
      expect.objectContaining({ kind: "folder", label: "Adaptations", parentId: flow?.id, viewId: "adaptations", flowId: "flow.checkout" }),
      expect.objectContaining({ kind: "flow-object", label: "Settings", parentId: flow?.id, viewId: "flow-settings", flowId: "flow.checkout" })
    ]));
    expect(nodes).toContainEqual(expect.objectContaining({ label: "Router", viewId: "flow-router", kind: "flow-object" }));
    expect(nodes.some((node) => node.label === "Runs" || node.viewId === "runs-history")).toBe(false);
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
    expect(subflows.every((node) => node.parentId === subflowsFolder?.id && node.viewId === "flow-nodes" && node.flowId === "flow.checkout" && typeof node.metadata?.graphFlowId === "string")).toBe(true);
  });

  it("does not multiply unlinked recordings across Flow hierarchies", () => {
    const flowCount = 100;
    const recordingCount = 500;
    const flows = Array.from({ length: flowCount }, (_, index) => ({
      source: "canonical",
      flow: { flowId: "flow." + index, name: "Flow " + index, expansion: {} }
    }));
    const recordings = Array.from({ length: recordingCount }, (_, index) => ({ recordingId: "recording." + index }));

    const nodes = flowHierarchyNodes(flows, { recordings });

    expect(nodes.filter((node) => node.kind === "flow")).toHaveLength(flowCount);
    expect(nodes.filter((node) => node.kind === "recording")).toHaveLength(0);
    expect(nodes.length).toBeLessThan(flowCount * 10);
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
      viewId: "flow-nodes",
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
        viewId: "flow-nodes",
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
    expect(nodes.some((node) => node.kind === "run" || node.viewId === "runs-history")).toBe(false);
  });
});
describe("hierarchy indexing at scale", () => {
  it("indexes and filters 10,000 nodes within the interaction budget", () => {
    const nodes: AutomationHierarchyNode[] = Array.from({ length: 10_000 }, (_, index) => ({
      id: "node-" + index,
      label: index === 9_999 ? "Needle" : "Node " + index,
      kind: index % 7 === 0 ? "folder" : "flow-object",
      category: "flow",
      parentId: index === 0 ? null : "node-" + Math.floor((index - 1) / 5)
    }));
    const startedAt = performance.now();
    const hierarchyIndex = indexAutomationHierarchyNodes(nodes);
    const visible = visibleAutomationHierarchyNodeIds(hierarchyIndex, (node) => node.label === "Needle");
    const elapsedMs = performance.now() - startedAt;

    expect(hierarchyIndex.byId.size).toBe(10_000);
    expect(hierarchyIndex.childrenByParentId.get("node-0")?.length).toBe(5);
    expect(visible.has("node-9999")).toBe(true);
    expect(visible.has("node-0")).toBe(true);
    expect(elapsedMs).toBeLessThan(500);
  });
});
