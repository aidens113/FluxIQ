// A Flow read back as a draft, and read forward again as an edit.
//
// The round trip is the whole point, so it is what these assert: a seeded step
// must be one the build's own writer can write down (`draft-step.ts`), or the
// extend loop would accrue a draft the completion check refuses; and the plan
// keys must map back to the node ids the Flow already has, or an "edit" mints a
// new node for every step it kept.

import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../../model/index.ts";
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions } from "../../../../nodes/index.ts";
import { assembleAutomationStudioFlowDraftPlan } from "../../../flow-bootstrap/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../../flow-bootstrap/plan/tests/index.ts";
import { automationStudioFlowDraftStepIsProposed, type AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { automationStudioFlowBootstrapDraftNodeStep, automationStudioFlowBootstrapDraftStepIsWritable } from "../draft-step.ts";
import { automationStudioFlowDraftPlanNodeIds, automationStudioFlowDraftSeedFromFlow } from "../draft-from-flow.ts";
import { AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID } from "../run-node.ts";

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

// `run-munq5s8x-6d620cdf`: the build wired the store's one-time "Continue
// shopping" press as optional (both ways into a Merge). The re-author seeded
// the Flow back as a draft with that press as a plain step, so the re-authored
// Flow ran it unconditionally, and the re-run -- whose session had already
// passed the check -- stopped on a press the page no longer showed.
describe("a re-authored Flow keeps the routing it inherited", () => {
  const MERGE = "builtin.control.merge";
  const CLICK = "web.output.dom-click";
  const EXTRACT = "web.output.dom-extract_list";
  const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
  const registry = new AutomationStudioNodeRegistry([...canonicalBuiltinAutomationNodeDefinitions, ...webDomainNodeDefinitionsFixture()]);
  const extractList = { item: "li.product", fields: { name: ".name", url: "a@href" } };

  /** navigate -> type -> press Go -> press Continue (optional) -> join -> extract, as the build assembled it. */
  function built(): { nodes: AutomationStudioFlowNode[]; edges: AutomationStudioFlowEdge[] } {
    const at = (id: string, definitionId: string, parameterValues: NonNullable<AutomationStudioFlowNode["parameterValues"]>): AutomationStudioFlowNode => ({ id, definitionId, parameterValues });
    const wire = (id: string, source: string, sourcePortId: string, target: string, targetPortId: string): AutomationStudioFlowEdge =>
      ({ id, sourceNodeId: source, targetNodeId: target, sourcePortId, targetPortId });
    return {
      nodes: [
        at("node.s1", "web.output.browser-navigate", { url: "https://shop.test/" }),
        at("node.s2", "web.output.dom-type", { selector: "#search", text: "wireless earbuds" }),
        at("node.s3", CLICK, { selector: "#go" }),
        at("node.s4", CLICK, { selector: "[data-testid=\"soft-check\"] > button" }),
        at("node.s5", MERGE, {}),
        at("node.s6", EXTRACT, { extractList })
      ],
      // In the order the build's graph lists them, failure first.
      edges: [
        wire("e1", "node.s4", "failed", "node.s5", "in"),
        wire("e2", "node.s1", "success", "node.s2", "in"),
        wire("e3", "node.s2", "success", "node.s3", "in"),
        wire("e4", "node.s3", "success", "node.s4", "in"),
        wire("e5", "node.s4", "success", "node.s5", "branches"),
        wire("e6", "node.s5", "success", "node.s6", "in")
      ]
    };
  }

  function assemble(steps: readonly AutomationStudioFlowDraftStep[]) {
    return assembleAutomationStudioFlowDraftPlan({
      steps: steps.filter(automationStudioFlowDraftStepIsProposed),
      write: automationStudioFlowBootstrapDraftNodeStep,
      registry,
      resolution,
      summary: "Read the earbuds"
    });
  }

  function wiring(plan: NonNullable<ReturnType<typeof assemble>["plan"]>): string[] {
    const subflow = plan.subflows[0]!;
    return subflow.edges.map((item) => `${item.source.nodeKey}:${item.source.portId} -> ${item.target.nodeKey}:${item.target.portId}`);
  }

  it("seeds a press whose failure and success both reach a Merge as optional, and nothing else", () => {
    const seed = automationStudioFlowDraftSeedFromFlow(built());
    expect(seed.steps.map((step) => seed.nodeIdByStepId[step.id!])).toEqual(["node.s1", "node.s2", "node.s3", "node.s4", "node.s5", "node.s6"]);
    expect(seed.steps.map((step) => step.routing?.kind ?? null)).toEqual([null, null, null, "optional", null, null]);
  });

  it("does not read a check whose failure alone reaches the Merge as optional", () => {
    const flow = built();
    // s4's success goes on to s6 instead: s4 now guards, it is not optional.
    flow.edges = flow.edges.map((item) => item.id === "e5" ? { ...item, targetNodeId: "node.s6", targetPortId: "in" } : item);
    expect(automationStudioFlowDraftSeedFromFlow(flow).steps.some((step) => step.routing !== undefined)).toBe(false);
  });

  it("keeps the optional press's failed -> merge when the re-author leaves it alone and changes another step", () => {
    const seed = automationStudioFlowDraftSeedFromFlow(built());
    // The re-author reran the read with a corrected list and dropped the old one.
    const reread: AutomationStudioFlowDraftStep = {
      position: 7, id: "d1", iteration: 3, callId: "call.1", actionId: EXTRACT, toolId: AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID,
      input: { node: EXTRACT, parameters: { extractList: { ...extractList, fields: { ...extractList.fields, price: ".price" } } } },
      effect: "observe", effectApplied: true, proposes: true, disposition: "kept"
    };
    const steps = [...seed.steps.slice(0, 5), { ...seed.steps[5]!, disposition: "dropped" as const }, reread];
    const assembled = assemble(steps);

    expect(assembled.issues.filter((item) => item.severity === "error")).toEqual([]);
    const subflow = assembled.plan!.subflows[0]!;
    // One join, the Flow's own, still at s5: no second Merge was added beside it.
    expect(subflow.nodes.map((node) => node.definitionId)).toEqual(["web.output.browser-navigate", "web.output.dom-type", CLICK, CLICK, MERGE, EXTRACT]);
    expect(wiring(assembled.plan!)).toEqual(expect.arrayContaining(["s4:failed -> s5:in", "s4:success -> s5:branches", "s5:success -> s6:in"]));
    // And every node the Flow already had keeps its id, the join included.
    expect(automationStudioFlowDraftPlanNodeIds({ steps, nodeIdByStepId: seed.nodeIdByStepId }))
      .toEqual({ s1: "node.s1", s2: "node.s2", s3: "node.s3", s4: "node.s4", s5: "node.s5" });
  });
});
