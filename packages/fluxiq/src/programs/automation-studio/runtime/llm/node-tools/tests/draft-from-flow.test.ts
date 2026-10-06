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
import { automationStudioFlowDraftReplayable, automationStudioFlowDraftStepIsProposed, type AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
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
  it("schedules an unchanged declared saved configuration from its captured start without performed evidence", () => {
    const seed = declaredSeed();
    expect(seed.steps[0]!.input.consequences).toEqual([]);
    expect(automationStudioFlowDraftReplayable(seed.steps)).toBe(true);
    expect(seed.steps[0]!.ranWith).toBeUndefined();
    expect(seed.steps[0]!.replay).toBeUndefined();
    expect(seed.steps[0]!.checkedCandidate).toBeUndefined();
    expect(seed.steps[0]!.effectApplied).toBeUndefined();
    expect(seed.steps[0]!.priorExecution).toBeUndefined();
  });

  it("refuses missing declarations or captured start, changed configuration and copied steps", () => {
    const node = { id: "saved", definitionId: "fixture.open", metadata: { declaredConsequences: [] } };
    expect(automationStudioFlowDraftReplayable(automationStudioFlowDraftSeedFromFlow({ nodes: [node], edges: [] }).steps)).toBe(false);
    expect(automationStudioFlowDraftReplayable(automationStudioFlowDraftSeedFromFlow({ nodes: [{ id: "saved", definitionId: "fixture.open" }], edges: [], startPages: { saved: { location: "fixture://start" } } }).steps)).toBe(false);
    const seed = declaredSeed();
    expect(automationStudioFlowDraftReplayable(seed.steps.map((step) => ({ ...step })))).toBe(false);
    seed.steps[0]!.input.parameters = { changed: true };
    expect(automationStudioFlowDraftReplayable(seed.steps)).toBe(false);
  });
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

function declaredSeed() {
  return automationStudioFlowDraftSeedFromFlow({
    nodes: [{ id: "saved", definitionId: "fixture.open", parameterValues: { text: { $state: { path: "text", fallback: "fixture" } } }, metadata: { declaredConsequences: [] } }],
    edges: [], startPages: { saved: { location: "fixture://start" } }
  });
}

describe("what state routing recorded on a node, carried through the re-seed", () => {
  // Supervisor (t243 -> t244): a node keeps `metadata.routeSignatures`, the
  // pages it ran between as the build signed them. A re-seed that dropped them
  // left a re-authored Flow routing by the ladder alone.
  it("carries a node's route signatures onto its step, unread", () => {
    const signatures = { before: { h: "1" }, after: { h: "2" }, effect: { added: ["x"] } };
    const nodes = flow().nodes.map((each) => each.id === "node.navigate" ? { ...each, metadata: { routeSignatures: signatures, other: 1 } } : each);
    const seeded = automationStudioFlowDraftSeedFromFlow({ ...flow(), nodes }).steps;
    expect(seeded[0]!.routeSignatures).toEqual(signatures);
    expect(seeded[1]!.routeSignatures).toBeUndefined();
  });

  it("carries nothing that is not an object of signatures", () => {
    for (const routeSignatures of [null, "sig", [{ h: "1" }], {}]) {
      const nodes = flow().nodes.map((each) => ({ ...each, metadata: { routeSignatures } as never }));
      expect(automationStudioFlowDraftSeedFromFlow({ ...flow(), nodes }).steps.every((each) => each.routeSignatures === undefined)).toBe(true);
    }
  });
});

// `run-muqk713g-d08ad3dc` (C6): every rerun of a seeded read ran on the page the
// refuted run had left it on. The run had recorded where each node started; the
// seed now keeps that beside its steps, for a rerun to put the page back to.
describe("where each seeded step's node started in the run being repaired", () => {
  const startPages = { "node.extract": { location: "https://example.test/catalog?page=1" } };

  it("is kept by step id beside the steps, for the node that has one", () => {
    const seed = automationStudioFlowDraftSeedFromFlow({ ...flow(), startPages });
    expect(seed.startedOnByStepId).toEqual({ f2: { location: "https://example.test/catalog?page=1" } });
    expect(seed.nodeIdByStepId.f2).toBe("node.extract");
  });

  it("is nothing when no run said where any node started", () => {
    expect(automationStudioFlowDraftSeedFromFlow(flow()).startedOnByStepId).toEqual({});
  });

  it("leaves the steps exactly as they were, so the dry run sees the same draft and still does not gate it", () => {
    const withPages = automationStudioFlowDraftSeedFromFlow({ ...flow(), startPages });
    const without = automationStudioFlowDraftSeedFromFlow(flow());
    expect(withPages.steps).toEqual(without.steps);
    expect(automationStudioFlowDraftReplayable(withPages.steps)).toBe(false);
  });

  it("is a copy: changing it changes nothing the run recorded", () => {
    const seed = automationStudioFlowDraftSeedFromFlow({ ...flow(), startPages });
    (seed.startedOnByStepId.f2 as { location: string }).location = "changed";
    expect(startPages["node.extract"].location).toBe("https://example.test/catalog?page=1");
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

  // t244: every carried step must run in the build before the Flow is tested
  // whole, and the rerun that does it is a new step. It keeps the node.
  it("names the existing node for a rerun that took a carried step's place", () => {
    const seed = automationStudioFlowDraftSeedFromFlow(flow());
    const steps = [
      { ...seed.steps[0]!, disposition: "dropped" as const, position: 2 },
      { ...seed.steps[0]!, id: "d4", position: 1, standsFor: seed.steps[0]!.id! },
      { ...seed.steps[1]!, position: 3 }
    ];
    expect(automationStudioFlowDraftPlanNodeIds({ steps, nodeIdByStepId: seed.nodeIdByStepId }))
      .toEqual({ s1: "node.navigate", s2: "node.extract" });
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

// C4 (t269): a repair that left a row loop untouched was refused at completion
// (`bootstrap.required_input_unconnected`) before any fresh test, because the
// For Each came back as a plain step with nothing feeding its `items`; and once
// it came back as a repeat, the loop's head Merge took the plan key the body's
// node id was handed, so the untouched body was minted a new id.
describe("a Flow's row loop read back as the repeat it was written from", () => {
  const MERGE = "builtin.control.merge";
  const EACH = "builtin.control.for-each";
  const TYPE = "web.output.dom-type";
  const EXTRACT = "web.output.dom-extract_list";
  const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
  const registry = new AutomationStudioNodeRegistry([...canonicalBuiltinAutomationNodeDefinitions, ...webDomainNodeDefinitionsFixture()]);
  const rowText = { $state: { path: "item.desired" } };
  const at = (id: string, definitionId: string, parameterValues: NonNullable<AutomationStudioFlowNode["parameterValues"]> = {}): AutomationStudioFlowNode => ({ id, definitionId, parameterValues });
  const wire = (id: string, source: string, sourcePortId: string, target: string, targetPortId: string): AutomationStudioFlowEdge =>
    ({ id, sourceNodeId: source, targetNodeId: target, sourcePortId, targetPortId });

  /** start -> list -> For Each (body: row type, back into the For Each) -> done -> summary type -> end, drawn by hand. */
  function drawn(): { nodes: AutomationStudioFlowNode[]; edges: AutomationStudioFlowEdge[] } {
    return {
      nodes: [
        at("start", "builtin.control.start"),
        at("list", EXTRACT, { extractList: { item: "li.row", fields: { name: ".name", desired: ".desired" } } }),
        at("each", EACH),
        at("row", TYPE, { selector: "#row-message", text: rowText }),
        at("summary", TYPE, { selector: "#message", text: "right" }),
        at("end", "builtin.control.end", { status: "success" })
      ],
      // The loop's exit listed before its body, so the walk has to put the body first.
      edges: [
        wire("e0", "each", "done", "summary", "in"), wire("e1", "start", "success", "list", "in"),
        wire("e2", "list", "success", "each", "in"), wire("e3", "list", "records", "each", "items"),
        wire("e4", "each", "body", "row", "in"), wire("e5", "each", "item", "row", "item"),
        wire("e6", "row", "success", "each", "in"), wire("e7", "summary", "success", "end", "in")
      ]
    };
  }

  function assemble(steps: readonly AutomationStudioFlowDraftStep[]) {
    return assembleAutomationStudioFlowDraftPlan({ steps: steps.filter(automationStudioFlowDraftStepIsProposed), write: automationStudioFlowBootstrapDraftNodeStep, registry, resolution, summary: "Write each row" });
  }

  /** A plan written back as the Flow it became, each node named after its plan key. */
  function saved(plan: NonNullable<ReturnType<typeof assemble>["plan"]>): { nodes: AutomationStudioFlowNode[]; edges: AutomationStudioFlowEdge[] } {
    const subflow = plan.subflows[0]!;
    return {
      nodes: subflow.nodes.map((item) => at(`node.${item.key}`, item.definitionId, item.parameters ?? {})),
      edges: subflow.edges.map((item, index) => wire(`e${index}`, `node.${item.source.nodeKey}`, item.source.portId, `node.${item.target.nodeKey}`, item.target.portId))
    };
  }

  it("seeds the list, then the body carrying the repeat, and leaves the For Each for the assembler", () => {
    const seed = automationStudioFlowDraftSeedFromFlow(drawn());
    expect(seed.steps.map((step) => seed.nodeIdByStepId[step.id!])).toEqual(["list", "row", "summary"]);
    expect(seed.steps.map((step) => step.routing ?? null)).toEqual([null, { kind: "repeat", through: "f2", over: "f1" }, null]);
    // The row binding is the Flow's own, byte for byte: no rewrite into `$row`.
    expect(seed.steps[1]!.input.parameters).toEqual({ selector: "#row-message", text: rowText });
  });

  it("assembles back into one loop over the list's rows, and reads that loop back the same way", () => {
    const first = assemble(automationStudioFlowDraftSeedFromFlow(drawn()).steps);
    expect(first.issues.filter((item) => item.severity === "error")).toEqual([]);
    expect(first.plan!.subflows[0]!.nodes.filter((item) => item.definitionId === EACH)).toHaveLength(1);
    const again = automationStudioFlowDraftSeedFromFlow(saved(first.plan!));
    expect(again.steps.map((step) => step.actionId)).toEqual([EXTRACT, TYPE, TYPE]);
    expect(again.steps.map((step) => step.routing ?? null)).toEqual([null, { kind: "repeat", through: "f2", over: "f1" }, null]);
    expect(assemble(again.steps).plan!.subflows[0]!.nodes.map((item) => item.definitionId)).toEqual(first.plan!.subflows[0]!.nodes.map((item) => item.definitionId));
  });

  it("keeps every step's node id against the plan, past the joins and the loop routing derived", () => {
    const flow = saved(assemble(automationStudioFlowDraftSeedFromFlow(drawn()).steps).plan!);
    const seed = automationStudioFlowDraftSeedFromFlow(flow);
    const plan = assemble(seed.steps).plan!;
    const nodeIdByKey = automationStudioFlowDraftPlanNodeIds({ steps: seed.steps, nodeIdByStepId: seed.nodeIdByStepId, plan });
    const definitionOf = new Map(plan.subflows[0]!.nodes.map((item) => [item.key, item.definitionId]));
    const wasDefinition = new Map(flow.nodes.map((item) => [item.id, item.definitionId]));
    expect(Object.keys(nodeIdByKey)).toHaveLength(3);
    for (const [key, nodeId] of Object.entries(nodeIdByKey)) expect(definitionOf.get(key)).toBe(wasDefinition.get(nodeId));
    expect(Object.values(nodeIdByKey).sort()).toEqual(seed.steps.map((step) => seed.nodeIdByStepId[step.id!]).sort());
  });

  it("reads anything but the assembler's shape as before, a plain For Each step", () => {
    const plain = (flow: { nodes: AutomationStudioFlowNode[]; edges: AutomationStudioFlowEdge[] }) => {
      const seed = automationStudioFlowDraftSeedFromFlow(flow);
      return { each: seed.steps.some((step) => step.actionId === EACH), repeats: seed.steps.some((step) => step.routing?.kind === "repeat") };
    };
    const settings = drawn();
    settings.nodes = settings.nodes.map((item) => item.id === "each" ? { ...item, parameterValues: { maxIterations: 3 } } : item);
    const branching = drawn();
    branching.edges.push(wire("e8", "row", "failed", "summary", "in"));
    const strayRow = drawn();
    strayRow.edges.push(wire("e9", "each", "item", "summary", "item"));
    const noRows = drawn();
    noRows.edges = noRows.edges.filter((item) => item.id !== "e3");
    for (const flow of [settings, branching, strayRow, noRows]) expect(plain(flow)).toEqual({ each: true, repeats: false });
    expect(plain(drawn())).toEqual({ each: false, repeats: true });
  });
});

// P5 (t270, t273): a saved Flow names an earlier node's output by the plan key
// that node was assembled under, `$node.<key>.<output>`. Re-seeded, that key
// names no node of the next plan, so it is read back as the seeded step the
// node became, `$step.<seed id>.<output>`, and assembly names it again.
describe("a saved Flow's earlier-output reference read back as a step binding", () => {
  const TYPE = "web.output.dom-type";
  const EXTRACT = "web.output.dom-extract_list";
  const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
  const registry = new AutomationStudioNodeRegistry([...canonicalBuiltinAutomationNodeDefinitions, ...webDomainNodeDefinitionsFixture()]);
  const extractList = { item: "li.row", fields: { name: ".name" } };
  const reference = (path: string) => ({ $state: { path } });

  /** list (saved as key s1) -> type its rows' names (s2), as an earlier build stored it. */
  function stored(path: string): { nodes: AutomationStudioFlowNode[]; edges: AutomationStudioFlowEdge[] } {
    return {
      nodes: [
        { id: "node.list", definitionId: EXTRACT, parameterValues: { extractList }, metadata: { bootstrapSymbolicKey: "s1" } },
        { id: "node.type", definitionId: TYPE, parameterValues: { selector: "#copy", text: reference(path) }, metadata: { bootstrapSymbolicKey: "s2" } }
      ],
      edges: [{ id: "e1", sourceNodeId: "node.list", targetNodeId: "node.type", sourcePortId: "success", targetPortId: "in" }]
    };
  }

  function assemble(steps: readonly AutomationStudioFlowDraftStep[]) {
    return assembleAutomationStudioFlowDraftPlan({ steps: steps.filter(automationStudioFlowDraftStepIsProposed), write: automationStudioFlowBootstrapDraftNodeStep, registry, resolution, summary: "Copy the names" });
  }

  it("seeds the reference as the step its node became, and assembles back to the same node reference", () => {
    const seed = automationStudioFlowDraftSeedFromFlow(stored("$node.s1.records.name"));
    expect(seed.steps[1]!.input.parameters).toEqual({ selector: "#copy", text: reference("$step.f1.records.name") });
    const assembled = assemble(seed.steps);
    expect(assembled.issues.filter((item) => item.severity === "error")).toEqual([]);
    expect(assembled.plan!.subflows[0]!.nodes[1]!.parameters).toMatchObject({ text: reference("$node.s1.records.name") });
  });

  it("leaves a key no node carries as written, so assembly refuses it rather than guessing", () => {
    const seed = automationStudioFlowDraftSeedFromFlow(stored("$node.s9.records"));
    expect(seed.steps[1]!.input.parameters).toEqual({ selector: "#copy", text: reference("$node.s9.records") });
    expect(assemble(seed.steps).issues.map((item) => item.code)).toContain("flow_draft.step_binding_source_missing");
  });

  it("leaves a key two nodes carry as written", () => {
    const flow = stored("$node.s1.records");
    flow.nodes[1]!.metadata = { bootstrapSymbolicKey: "s1" };
    expect(automationStudioFlowDraftSeedFromFlow(flow).steps[1]!.input.parameters).toEqual({ selector: "#copy", text: reference("$node.s1.records") });
  });
});
