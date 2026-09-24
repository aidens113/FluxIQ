// A Flow read back as a draft, and read forward again as an edit.
//
// The round trip is the whole point, so it is what these assert: a seeded step
// must be one the build's own writer can write down (`draft-step.ts`), or the
// extend loop would accrue a draft the completion check refuses; and the plan
// keys must map back to the node ids the Flow already has, or an "edit" mints a
// new node for every step it kept.

import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../../model/index.ts";
import { automationStudioFlowDraftStepIsProposed } from "../../../flow-draft/index.ts";
import { automationStudioFlowBootstrapDraftNodeStep, automationStudioFlowBootstrapDraftStepIsWritable } from "../draft-step.ts";
import { automationStudioFlowDraftPlanNodeIds, automationStudioFlowDraftSeedFromFlow } from "../draft-from-flow.ts";

function node(id: string, definitionId: string, parameterValues?: Record<string, string>): AutomationStudioFlowNode {
  return { id, definitionId, ...(parameterValues ? { parameterValues } : {}) };
}

function edge(id: string, sourceNodeId: string, targetNodeId: string): AutomationStudioFlowEdge {
  return { id, sourceNodeId, targetNodeId };
}

/** navigate -> extract, written out of order so the walk has something to do. */
function flow(): { nodes: AutomationStudioFlowNode[]; edges: AutomationStudioFlowEdge[] } {
  return {
    nodes: [
      node("node.extract", "web.dom.extract_list", { request: "rows" }),
      node("node.navigate", "web.page.navigate", { url: "https://example.test/catalog" })
    ],
    edges: [edge("edge.1", "node.navigate", "node.extract")]
  };
}

describe("a Flow read back as a draft", () => {
  it("orders the steps the way the Flow runs them, not the way the document lists them", () => {
    const seed = automationStudioFlowDraftSeedFromFlow(flow());
    expect(seed.steps.map((step) => step.actionId)).toEqual(["web.page.navigate", "web.dom.extract_list"]);
    expect(seed.steps.map((step) => step.position)).toEqual([1, 2]);
    expect(seed.steps.map((step) => seed.nodeIdByStepId[step.id!])).toEqual(["node.navigate", "node.extract"]);
  });

  it("leaves out the control nodes the assembler derives rather than authors", () => {
    const seed = automationStudioFlowDraftSeedFromFlow({
      nodes: [node("node.start", "builtin.control.start"), node("node.navigate", "web.page.navigate"), node("node.end", "builtin.control.end")],
      edges: [edge("edge.1", "node.start", "node.navigate"), edge("edge.2", "node.navigate", "node.end")]
    });
    expect(seed.steps.map((step) => step.actionId)).toEqual(["web.page.navigate"]);
  });

  it("keeps a node nothing points at rather than dropping it", () => {
    const seed = automationStudioFlowDraftSeedFromFlow({
      nodes: [node("node.a", "web.page.navigate"), node("node.b", "web.dom.click"), node("node.c", "web.dom.extract_list")],
      edges: [edge("edge.1", "node.a", "node.c")]
    });
    expect(seed.steps.map((step) => step.actionId)).toEqual(["web.page.navigate", "web.dom.extract_list", "web.dom.click"]);
  });

  it("produces steps the build's own writer can write down, with the node's parameters", () => {
    const seed = automationStudioFlowDraftSeedFromFlow(flow());
    expect(seed.steps.every(automationStudioFlowBootstrapDraftStepIsWritable)).toBe(true);
    expect(seed.steps.every(automationStudioFlowDraftStepIsProposed)).toBe(true);
    const written = automationStudioFlowBootstrapDraftNodeStep(seed.steps[0]!);
    expect(written?.node).toBe("web.page.navigate");
    expect(written?.entries).toEqual([{ key: "url", value: "https://example.test/catalog" }]);
  });

  it("declares no consequence for a node it did not author", () => {
    const [step] = automationStudioFlowDraftSeedFromFlow(flow()).steps;
    expect(automationStudioFlowBootstrapDraftNodeStep(step!)?.entries?.some((entry) => entry.key === "consequences")).toBe(false);
  });

  it("carries nothing that would put a seeded draft under the dry run", () => {
    // Core cannot say how to put a page back the way a node it never watched
    // found it, so a seeded step says nothing about replaying.
    expect(automationStudioFlowDraftSeedFromFlow(flow()).steps.every((step) => step.replay === undefined && step.ranWith === undefined)).toBe(true);
  });
});

describe("the plan keys an amended draft maps back to", () => {
  it("names the existing node for each step the model kept, in plan order", () => {
    const seed = automationStudioFlowDraftSeedFromFlow(flow());
    expect(automationStudioFlowDraftPlanNodeIds({ steps: seed.steps, nodeIdByStepId: seed.nodeIdByStepId }))
      .toEqual({ s1: "node.navigate", s2: "node.extract" });
  });

  it("gives a step the build added no existing node, and moves the ones after it along", () => {
    const seed = automationStudioFlowDraftSeedFromFlow(flow());
    // The build ran a search between the two steps the Flow already had: the
    // missing step a wrong answer is about.
    const steps = [
      seed.steps[0]!,
      { ...seed.steps[0]!, id: "d1", position: 2, actionId: "web.dom.type", input: { node: "web.dom.type", parameters: {} } },
      { ...seed.steps[1]!, position: 3 }
    ];
    expect(automationStudioFlowDraftPlanNodeIds({ steps, nodeIdByStepId: seed.nodeIdByStepId }))
      .toEqual({ s1: "node.navigate", s3: "node.extract" });
  });

  it("lets go of the id of a step the model dropped", () => {
    const seed = automationStudioFlowDraftSeedFromFlow(flow());
    const steps = [{ ...seed.steps[0]!, disposition: "dropped" as const }, { ...seed.steps[1]!, position: 1 }];
    expect(automationStudioFlowDraftPlanNodeIds({ steps, nodeIdByStepId: seed.nodeIdByStepId })).toEqual({ s1: "node.extract" });
  });
});
