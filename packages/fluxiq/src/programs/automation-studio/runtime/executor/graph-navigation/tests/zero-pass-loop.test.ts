// t466, lane D round 8 (`run-mv5jnc5m-a47c3e59`, revs 3 and 5): a listing whose two required conditions kept
// 0 of 8 rows fed a For Each that ran no passes. The run reached its final read with the loop's body unvisited and
// was failed `executor.graph.unvisited_nodes`, which the model was told was a wiring fault. A loop that ran no passes
// is a valid ending; a node the run still owed is not excused by it.
import { describe, expect, it } from "vitest";
import { createBlankAutomationStudioFlowArtifact, type AutomationStudioFlowDocument, type AutomationStudioFlowNode } from "../../../../model/index.ts";
import { AutomationStudioNodeRegistry, type AutomationNodePort } from "../../../../nodes/index.ts";
import { acceptAutomationStudioFlowBootstrapResult, normalizeAutomationStudioFlowBuildPlan, validateAutomationStudioFlowBootstrapPlan } from "../../../flow-bootstrap/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../../flow-bootstrap/plan/tests/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioNodeAttemptTrace } from "../../contracts.ts";
import { hasUnvisitedAutomationStudioNodes } from "../../graph-navigation.ts";
import { runAutomationStudioGraph } from "../../index.ts";
import { automationStudioZeroPassLoopBodies } from "../index.ts";

const edge = (sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId = "in") => ({ id: `${sourceNodeId}.${sourcePortId}.${targetNodeId}`, sourceNodeId, sourcePortId, targetNodeId, targetPortId });
const constant = (id: string, value: unknown = id): AutomationStudioFlowNode => ({ id, definitionId: "builtin.data.constant", parameterValues: { value } } as AutomationStudioFlowNode);

/** list -> head -> each; body: confirm -> wait -> head; done -> merge -> final read, with no End node (the round-8 shape). */
function confirmLoop(rows: number, extra: { nodes?: AutomationStudioFlowNode[]; edges?: ReturnType<typeof edge>[] } = {}): AutomationStudioFlowDocument {
  return {
    schemaVersion: "0.1", flowId: "flow.zero-pass", ownerKind: "routine", ownerId: "routine.test", name: "Zero pass", createdAt: 1, updatedAt: 1,
    nodes: [
      constant("list", Array.from({ length: rows }, (_, index) => index + 1)),
      { id: "head", definitionId: "builtin.control.merge", parameterValues: { mergeMode: "first" } },
      { id: "each", definitionId: "builtin.control.for-each" },
      constant("confirm"),
      constant("wait"),
      { id: "after", definitionId: "builtin.control.merge", parameterValues: { mergeMode: "first" } },
      constant("final"),
      ...(extra.nodes ?? [])
    ],
    edges: [
      edge("list", "success", "head"), edge("list", "value", "each", "items"), edge("head", "success", "each"),
      edge("each", "body", "confirm"), edge("confirm", "success", "wait"), edge("wait", "success", "head", "branches"),
      edge("each", "done", "after"), edge("after", "success", "final"),
      ...(extra.edges ?? [])
    ]
  };
}

function attempt(nodeId: string, definitionId: string, route?: string): AutomationStudioNodeAttemptTrace {
  return { attemptId: `attempt.${nodeId}.${route ?? "success"}`, nodeId, definitionId, startedAt: 1, status: "succeeded", ...(route ? { route } : {}), inputs: {}, outputs: {}, effects: [] };
}

describe("a loop that ran no passes", () => {
  it("names the nodes only its body reaches, and none its way on reaches", () => {
    const attempts = [attempt("list", "builtin.data.constant"), attempt("head", "builtin.control.merge"), attempt("each", "builtin.control.for-each", "done")];
    expect(automationStudioZeroPassLoopBodies(confirmLoop(0), attempts).sort()).toEqual(["confirm", "head", "wait"]);
  });

  it("names nothing for a loop that took its body at least once, or was never reached", () => {
    const ran = [attempt("each", "builtin.control.for-each", "body"), attempt("confirm", "builtin.data.constant"), attempt("each", "builtin.control.for-each", "done")];
    expect(automationStudioZeroPassLoopBodies(confirmLoop(1), ran)).toEqual([]);
    expect(automationStudioZeroPassLoopBodies(confirmLoop(0), [attempt("list", "builtin.data.constant")])).toEqual([]);
  });

  it("keeps a step the loop's way on also reaches owed", () => {
    const flow = confirmLoop(0, { edges: [edge("each", "failed", "wait")] });
    const attempts = [attempt("each", "builtin.control.for-each", "done")];
    expect(automationStudioZeroPassLoopBodies(flow, attempts)).toEqual(["confirm"]);
  });

  it("ends a run over a list with no rows succeeded at its final read, with the body never run", async () => {
    const trace = await runAutomationStudioGraph(confirmLoop(0), { startNodeId: "list" });
    expect(trace.status).toBe("succeeded");
    expect(trace.failure).toBeUndefined();
    expect(trace.attempts.map((step) => step.nodeId)).toEqual(["list", "head", "each", "after", "final"]);
  });

  it("still fails a run that left a disconnected step behind", async () => {
    const trace = await runAutomationStudioGraph(confirmLoop(0, { nodes: [constant("mandatory")] }), { startNodeId: "list" });
    expect(trace.status).toBe("failed");
    expect(trace.failure?.code).toBe("executor.graph.unvisited_nodes");
  });

  it("still counts an untaken branch inside a loop that did run", () => {
    const flow = confirmLoop(1, { nodes: [constant("other")], edges: [edge("confirm", "failed", "other"), edge("other", "success", "wait")] });
    const attempts = [attempt("list", "builtin.data.constant"), attempt("head", "builtin.control.merge"), attempt("each", "builtin.control.for-each", "body"),
      attempt("confirm", "builtin.data.constant"), attempt("wait", "builtin.data.constant"), attempt("head", "builtin.control.merge"),
      attempt("each", "builtin.control.for-each", "done"), attempt("after", "builtin.control.merge"), attempt("final", "builtin.data.constant")];
    expect(hasUnvisitedAutomationStudioNodes(flow, attempts)).toBe(true);
  });
});

// t474, lane D round 9 (`run-mv5q4j2n-25784472`, revs 5 to 15): the shape above has no `item` edges, so t466 held in
// its test and never in a live run. The compiler hands each pass's row to every body step whose node takes one
// (`flow-bootstrap/authoring/draft-routing.ts`), as an edge from the For Each's `item` port. That edge carries a
// value, not the run: the loop's way on is its routes alone. Seven trials whose listing kept no rows were failed
// `executor.graph.unvisited_nodes` and told to check the Flow's connections. The graph here is the compiler's own.
describe("a loop that ran no passes, on the graph the compiler writes", () => {
  const ROW_INPUT: AutomationNodePort = { id: "item", label: "Item", valueType: "any", role: "data", required: false };
  const ROW_TAKERS = new Set(["web.output.dom-click", "web.output.dom-wait_for_text"]);
  // The web library as the domain declares it downstream: a click and a wait that each take the row a pass is on.
  const registry = new AutomationStudioNodeRegistry();
  for (const definition of webDomainNodeDefinitionsFixture()) registry.register(ROW_TAKERS.has(definition.id) ? { ...definition, inputs: [...definition.inputs, ROW_INPUT] } : definition);
  const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
  const INVITATIONS = JSON.stringify({ item: ".invitation", fields: { name: ".who", team: ".team" } });
  const MEMBERS = JSON.stringify({ item: ".member", fields: { name: ".who" } });
  const SCRIPT = [
    "flow: Accept every pending invitation from the design team",
    "step: open the invitations",
    "  node: web.browser.navigate",
    "  url: https://workspace.test/invitations",
    "step invitations: list the invitations from the design team",
    "  node: web.dom.extract_list",
    `  extractList: ${INVITATIONS}`,
    "  extractList.minItems: 0",
    "step accept: accept the invitation",
    "  node: web.dom.click",
    "  selector: .accept",
    "  consequences: modify_existing",
    "  repeat over: invitations",
    "  repeat through: accepted",
    "step accepted: check it was accepted",
    "  node: web.dom.wait_for_text",
    "  text: $row.name",
    "step members: read the members",
    "  node: web.dom.extract_list",
    `  extractList: ${MEMBERS}`,
    "  extractList.minItems: 0"
  ].join("\n");

  /** The script as a build saves it: accepted, validated and laid out as a Flow, with its node ids by step label. */
  function compiled(): { flow: AutomationStudioFlowDocument; id: (label: string) => string } {
    const accepted = acceptAutomationStudioFlowBootstrapResult({ result: { summary: "invitations", flow: SCRIPT }, registry, resolution });
    if (!accepted.ok) throw new Error(JSON.stringify(accepted.issues));
    const validated = validateAutomationStudioFlowBootstrapPlan({ plan: accepted.plan, registry, resolution });
    if (!validated.validated) throw new Error(validated.issues.map((issue) => issue.code).join(", "));
    const topology = normalizeAutomationStudioFlowBuildPlan({
      adaptationId: "adaptation.bootstrap.3c1d2e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
      parentFlow: createBlankAutomationStudioFlowArtifact({ flowId: "flow.invitations", projectId: "project.invitations", name: "Invitations", now: 1 }),
      buildPlan: validated.validated, sourceInstructionIds: ["instruction.1"], now: 1
    });
    const flow = topology.subflows[0]!.graphFlow as unknown as AutomationStudioFlowDocument;
    const byLabel = new Map(flow.nodes.map((node) => [node.label, node.id]));
    return { flow, id: (label) => byLabel.get(label) ?? label };
  }

  /** Every web step succeeds; each list read answers `rows` rows. */
  const host = (rows: number): NonNullable<AutomationStudioGraphExecutionOptions["nativeNodeExecutor"]> => async (request) => ({
    result: { status: "success", route: "success", outputs: request.node.definitionId === "web.output.dom-extract_list" ? { records: Array.from({ length: rows }, (_, index) => ({ name: `Person ${index + 1}` })) } : {} }
  });

  it("is the shape the live run had: the For Each hands its row to both body steps", () => {
    const { flow, id } = compiled();
    const each = flow.nodes.find((node) => node.definitionId === "builtin.control.for-each")!;
    const rowEdges = flow.edges.filter((edge) => edge.sourceNodeId === each.id && edge.sourcePortId === "item").map((edge) => edge.targetNodeId).sort();
    expect(rowEdges).toEqual([id("accept the invitation"), id("check it was accepted")].sort());
  });

  it("names the body steps of a loop over a listing that kept no rows, never the steps after it", async () => {
    const { flow, id } = compiled();
    const trace = await runAutomationStudioGraph(flow, { nativeNodeExecutor: host(0), delay: async () => undefined });
    const bodies = automationStudioZeroPassLoopBodies(flow, trace.attempts);
    expect(bodies).toEqual(expect.arrayContaining([id("accept the invitation"), id("check it was accepted")]));
    expect(bodies).not.toContain(id("read the members"));
    expect(bodies).not.toContain(id("list the invitations from the design team"));
  });

  it("ends that run succeeded at its last read, the body never run", async () => {
    const { flow, id } = compiled();
    const trace = await runAutomationStudioGraph(flow, { nativeNodeExecutor: host(0), delay: async () => undefined });
    expect(trace.failure?.code).toBeUndefined();
    expect(trace.status).toBe("succeeded");
    const ran = trace.attempts.map((attempt) => attempt.nodeId);
    expect(ran).toContain(id("read the members"));
    expect(ran).not.toContain(id("accept the invitation"));
  });

  it("still runs the body for every row a listing kept, and owes nothing after", async () => {
    const { flow, id } = compiled();
    const trace = await runAutomationStudioGraph(flow, { nativeNodeExecutor: host(2), delay: async () => undefined });
    expect(trace.status).toBe("succeeded");
    expect(trace.attempts.filter((attempt) => attempt.nodeId === id("accept the invitation"))).toHaveLength(2);
    expect(automationStudioZeroPassLoopBodies(flow, trace.attempts)).toEqual([]);
  });
});
