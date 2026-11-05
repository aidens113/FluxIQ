// A call step that pins a saved part goes the one way a Subflow's call goes, and says which version ran.
import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowDocument } from "../../tests/fixture-contracts.ts";
import type { AutomationStudioFlowNode } from "../../../../flows/executable/graph/index.ts";
import { automationNodeStateBinding } from "../../../../components/automation/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions, type AutomationStudioGraphExecutionTrace } from "../../index.ts";
import { AUTOMATION_STUDIO_PART_CALL_MAX_DEPTH, automationStudioPartPinOf, automationStudioPinOfSubflowId, automationStudioPinnedSubflowId, type AutomationStudioSubflowGraph, type AutomationStudioSubflowGraphSource } from "../index.ts";

const CALL = "builtin.control.call-subflow";
const PIN = { partId: "part.save", version: 2 };
const PINNED_ID = automationStudioPinnedSubflowId(PIN);

function graph(flowId: string, nodes: AutomationStudioFlowNode[]): AutomationStudioFlowDocument {
  const edges = nodes.slice(1).map((node, index) => ({ id: `${nodes[index]!.id}.${node.id}`, sourceNodeId: nodes[index]!.id, targetNodeId: node.id, sourcePortId: "success", targetPortId: "in" }));
  return { schemaVersion: "0.1", flowId, ownerKind: "routine", ownerId: flowId, name: flowId, nodes, edges, createdAt: 1, updatedAt: 1 };
}

const child = (subflowId: string): AutomationStudioSubflowGraph => ({
  subflowId, graphRevision: 7,
  graph: graph(`graph.${subflowId}`, [{ id: "start", definitionId: "builtin.control.start" }, { id: "echo", definitionId: "builtin.data.constant", parameterValues: { value: automationNodeStateBinding("query") } }])
});

const caller = (parameters: Record<string, JsonValue>) => graph("graph.caller", [
  { id: "start", definitionId: "builtin.control.start" },
  { id: "call", definitionId: CALL, parameterValues: { inputs: { query: "words" }, outputs: { "echo.value": "echoed" }, ...parameters } }
]);

const source = (graphs: Record<string, AutomationStudioSubflowGraph>, extra: Partial<AutomationStudioSubflowGraphSource> = {}, loads: string[] = []): AutomationStudioSubflowGraphSource => ({
  load: async (subflowId) => {
    loads.push(subflowId);
    return graphs[subflowId];
  },
  ...extra
});

async function run(flow: AutomationStudioFlowDocument, options: AutomationStudioGraphExecutionOptions): Promise<{ saved: AutomationStudioGraphExecutionTrace; executed: AutomationStudioGraphExecutionTrace }> {
  let executed: AutomationStudioGraphExecutionTrace | undefined;
  const saved = await runAutomationStudioGraph(flow, options, (trace) => { executed = trace; });
  return { saved, executed: executed ?? saved };
}

const failureOf = (trace: AutomationStudioGraphExecutionTrace) => trace.attempts.at(-1)?.failure?.code;

describe("a call step that pins a saved part", () => {
  it("reads a pin, and an id that holds one, and nothing else as one", () => {
    expect(automationStudioPartPinOf({ partId: " part.a ", version: 3 })).toEqual({ partId: "part.a", version: 3 });
    const bad: JsonValue[] = [{ partId: "part.a" }, { partId: "", version: 1 }, { partId: "part.a", version: 0 }, { partId: "part.a", version: 1.5 }, "part.a", [], null];
    for (const value of bad) expect(automationStudioPartPinOf(value)).toBeUndefined();
    expect(automationStudioPinOfSubflowId(automationStudioPinnedSubflowId({ partId: "part:odd:v2", version: 9 }))).toEqual({ partId: "part:odd:v2", version: 9 });
    for (const other of ["subflow.a", "part:x", "part:x:v0", "part:x:v", null, undefined]) expect(automationStudioPinOfSubflowId(other)).toBeUndefined();
  });

  it("runs the version it pins as a frame of its own, and its target says which", async () => {
    const loads: string[] = [];
    const { saved, executed } = await run(caller({ part: PIN }), { inputs: {}, currentSubflowId: "main", subflowGraphs: source({ [PINNED_ID]: child(PINNED_ID) }, {}, loads) });
    expect(saved.status).toBe("succeeded");
    expect(loads).toEqual([PINNED_ID]);
    expect(executed.values.echoed).toBe("words");
    const call = saved.attempts.find((attempt) => attempt.nodeId === "call")!;
    expect(call.subflowTarget).toEqual({ subflowId: PINNED_ID, graphFlowId: `graph.${PINNED_ID}`, graphRevision: 7 });
    expect(call.childTrace?.attempts.map((attempt) => attempt.nodeId)).toEqual(["start", "echo"]);
  });

  it("a step naming both runs the sibling this automation has, and the pin when it has none", async () => {
    const both = caller({ subflowId: "sibling", part: PIN });
    const sibling = await run(both, { inputs: {}, currentSubflowId: "main", subflowGraphs: source({ sibling: child("sibling"), [PINNED_ID]: child(PINNED_ID) }) });
    expect(sibling.saved.attempts.at(-1)?.subflowTarget?.subflowId).toBe("sibling");
    const pinned = await run(both, { inputs: {}, currentSubflowId: "main", subflowGraphs: source({ [PINNED_ID]: child(PINNED_ID) }) });
    expect(pinned.saved.attempts.at(-1)?.subflowTarget?.subflowId).toBe(PINNED_ID);
  });

  it("fails the call with a closed code when the version is not in the library, with nothing run", async () => {
    const { saved } = await run(caller({ part: PIN }), { inputs: {}, currentSubflowId: "main", subflowGraphs: source({}) });
    expect(saved.status).toBe("failed");
    expect(failureOf(saved)).toBe("executor.call_subflow.part_version_missing");
  });

  it("fails the call when a pin cannot be read, and never reads a source for it", async () => {
    const loads: string[] = [];
    const { saved } = await run(caller({ part: { partId: "part.save" } }), { inputs: {}, currentSubflowId: "main", subflowGraphs: source({ [PINNED_ID]: child(PINNED_ID) }, {}, loads) });
    expect(failureOf(saved)).toBe("executor.call_subflow.part_invalid");
    expect(loads).toEqual([]);
  });

  it("a Subflow id written by hand in a pin's form never reaches the library: only a pin does", async () => {
    const loads: string[] = [];
    const { saved } = await run(caller({ subflowId: PINNED_ID }), { inputs: {}, currentSubflowId: "main", subflowGraphs: source({ [PINNED_ID]: child(PINNED_ID) }, {}, loads) });
    expect(failureOf(saved)).toBe("executor.call_subflow.unknown");
    expect(loads).toEqual([]);
  });

  it("a Subflow that is not the automation's stays refused: an unpinned call does not reach the library", async () => {
    const { saved } = await run(caller({ subflowId: "subflow.of.another.flow" }), { inputs: {}, currentSubflowId: "main", subflowGraphs: source({ [PINNED_ID]: child(PINNED_ID) }) });
    expect(failureOf(saved)).toBe("executor.call_subflow.unknown");
  });

  it("takes the source's stable refusal before the frame starts", async () => {
    const loads: string[] = [];
    const { saved } = await run(caller({ part: PIN }), { inputs: {}, currentSubflowId: "main", subflowGraphs: source({ [PINNED_ID]: child(PINNED_ID) }, { pinRefusal: async () => ({ code: "part.call_cycle", message: "It ends up calling itself." }) }, loads) });
    expect(failureOf(saved)).toBe("part.call_cycle");
    expect(loads).toEqual([]);
  });

  it("refuses a pinned part already running in this run", async () => {
    const self: AutomationStudioSubflowGraph = { subflowId: PINNED_ID, graphRevision: 1, graph: caller({ part: PIN }) };
    const { saved } = await run(caller({ part: PIN }), { inputs: {}, currentSubflowId: "main", subflowGraphs: source({ [PINNED_ID]: self }) });
    const inner = saved.attempts.at(-1)?.childTrace?.attempts.at(-1);
    expect(inner?.failure?.code).toBe("executor.call_subflow.cycle");
  });

  it("refuses to go deeper than saved parts may call each other, whatever the source says", async () => {
    const chain: Record<string, AutomationStudioSubflowGraph> = {};
    const idOf = (level: number) => automationStudioPinnedSubflowId({ partId: `part.${level}`, version: 1 });
    for (let level = 1; level <= AUTOMATION_STUDIO_PART_CALL_MAX_DEPTH + 1; level += 1) {
      chain[idOf(level)] = { subflowId: idOf(level), graphRevision: 1, graph: graph(`graph.${level}`, [{ id: "start", definitionId: "builtin.control.start" }, { id: `call.${level}`, definitionId: CALL, parameterValues: { part: { partId: `part.${level + 1}`, version: 1 } } }]) };
    }
    const { saved } = await run(caller({ part: { partId: "part.1", version: 1 } }), { inputs: {}, currentSubflowId: "main", subflowGraphs: source(chain) });
    let deepest = saved.attempts.at(-1);
    let frames = 0;
    while (deepest?.childTrace?.attempts.length) {
      deepest = deepest.childTrace.attempts.at(-1);
      frames += 1;
    }
    expect(frames).toBe(AUTOMATION_STUDIO_PART_CALL_MAX_DEPTH);
    expect(deepest?.failure?.code).toBe("executor.call_subflow.too_deep");
  });
});
