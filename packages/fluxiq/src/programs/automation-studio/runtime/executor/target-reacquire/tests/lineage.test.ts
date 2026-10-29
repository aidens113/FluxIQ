// Where a step's target came from (t786, design D1): read from the graph, a
// For Each pass's row or a binding onto another node's output, the innermost
// loop winning, and a source that acts still named (its re-run is refused
// elsewhere).

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../../../model/index.ts";
import { automationStudioReacquireSourceReadOnly, automationStudioTargetLineage } from "../index.ts";
import { cardsFlow, edge, graph, press, readCards, saveCard } from "./reacquire-fixtures.ts";

const forEach = (id: string): AutomationStudioFlowNode => ({ id, definitionId: "builtin.control.for-each" });
const bound = (path: string) => ({ $state: { path } }) as unknown as JsonObject;
const nodeOf = (flow: ReturnType<typeof graph>, id: string) => flow.nodes.find((node) => node.id === id)!;

describe("a step's lineage", () => {
  it("is the row a For Each hands it, from the node whose rows its items are wired from", () => {
    const flow = cardsFlow();
    expect(automationStudioTargetLineage(flow, nodeOf(flow, "save"))).toEqual({ kind: "row", sourceNodeId: "read", outputKey: "rows", loopNodeId: "each" });
  });

  it("is the row for a body step that reads the pass's row by binding alone, with no item edge", () => {
    const wired = cardsFlow();
    const flow = { ...wired, edges: wired.edges.filter((candidate) => candidate.sourcePortId !== "item") };
    expect(automationStudioTargetLineage(flow, nodeOf(flow, "save"))).toEqual({ kind: "row", sourceNodeId: "read", outputKey: "rows", loopNodeId: "each" });
    // A binding onto the loop's own item output names the loop too.
    const byLoop = { ...flow, nodes: flow.nodes.map((node) => (node.id === "save" ? press("save", "save", { row: bound("each.item.id") }) : node)) };
    expect(automationStudioTargetLineage(byLoop, nodeOf(byLoop, "save"))).toMatchObject({ kind: "row", loopNodeId: "each", sourceNodeId: "read" });
  });

  it("is the output of the node a parameter is bound to by `$node`, an element-target parameter first", () => {
    const find = { ...press("find", "find", {}, { effect: "observe", bootstrapSymbolicKey: "s1" }), label: "Find the button" };
    const note = { ...press("note", "note", {}, { bootstrapSymbolicKey: "s2" }) };
    const act = press("act", "act", { text: bound("$node.s2.text"), element: bound("$node.s1.element") });
    const flow = graph([{ id: "start", definitionId: "builtin.control.start" }, find, note, act], [edge("start", "find"), edge("find", "note"), edge("note", "act")]);
    expect(automationStudioTargetLineage(flow, act)).toEqual({ kind: "output", sourceNodeId: "find", outputKey: "element", parameterPath: "parameters.element" });
    // With no element-target parameter, the first binding wins; a run path onto a node's output counts as one.
    const plain = press("act", "act", { text: bound("note.text.value"), other: bound("$node.s1.element") });
    const flowPlain = { ...flow, nodes: [...flow.nodes.slice(0, 3), plain] };
    expect(automationStudioTargetLineage(flowPlain, plain)).toEqual({ kind: "output", sourceNodeId: "note", outputKey: "text", parameterPath: "parameters.text" });
  });

  it("takes the innermost loop of nested loops", () => {
    const nodes: AutomationStudioFlowNode[] = [
      { id: "start", definitionId: "builtin.control.start" },
      readCards(),
      forEach("outer"),
      { ...press("steps", "steps", {}, { effect: "observe" }), label: "Read the steps" },
      forEach("inner"),
      saveCard(),
      { id: "end", definitionId: "builtin.control.end" }
    ];
    const flow = graph(nodes, [
      edge("start", "read"),
      edge("read", "outer"),
      edge("read", "outer", "rows", "items"),
      edge("outer", "steps", "body"),
      edge("steps", "inner"),
      edge("steps", "inner", "rows", "items"),
      edge("inner", "save", "body"),
      edge("save", "inner"),
      edge("inner", "outer", "done"),
      edge("outer", "end", "done")
    ]);
    // `item` is the inner pass's row: the inner loop and its rows' reader.
    expect(automationStudioTargetLineage(flow, nodeOf(flow, "save"))).toEqual({ kind: "row", sourceNodeId: "steps", outputKey: "rows", loopNodeId: "inner" });
    // A step wired the outer loop's row, inside both, still names the outer.
    const outerWired = graph(nodes.map((node) => (node.id === "save" ? press("save", "save") : node)), [...flow.edges, edge("outer", "save", "item", "item")]);
    expect(automationStudioTargetLineage(outerWired, nodeOf(outerWired, "save"))).toEqual({ kind: "row", sourceNodeId: "read", outputKey: "rows", loopNodeId: "outer" });
  });

  it("names a source that acts, whose re-run is then refused", () => {
    const flow = cardsFlow({ read: readCards("mutate") });
    expect(automationStudioTargetLineage(flow, nodeOf(flow, "save"))).toMatchObject({ kind: "row", sourceNodeId: "read" });
    expect(automationStudioReacquireSourceReadOnly(nodeOf(flow, "read"))).toBe(false);
    expect(automationStudioReacquireSourceReadOnly(readCards())).toBe(true);
    // A read that also declares a lasting consequence, or says nothing about itself, is not re-run either.
    expect(automationStudioReacquireSourceReadOnly({ ...readCards(), metadata: { effect: "observe", declaredConsequences: ["sends a message"] } })).toBe(false);
    expect(automationStudioReacquireSourceReadOnly(press("read", "read"))).toBe(false);
    // A saved list read says what it carries out rather than that it observes (t786 integration).
    expect(automationStudioReacquireSourceReadOnly({ ...press("read", "read"), metadata: { recordsPath: "result.extracted" } })).toBe(true);
    expect(automationStudioReacquireSourceReadOnly({ ...press("read", "read"), metadata: { recordsPath: "result.extracted", effect: "mutate" } })).toBe(false);
  });

  it("is none for a step whose target came from no other step", () => {
    const fixed = press("save", "save", { row: { id: "r1" } });
    const wired = cardsFlow({ save: fixed });
    const flow = { ...wired, edges: wired.edges.filter((candidate) => candidate.sourcePortId !== "item") };
    expect(automationStudioTargetLineage(flow, fixed)).toBeUndefined();
    // A row binding with no loop holding the step, a For Each whose items no node supplies, and a key no node carries: none.
    const loose = press("save", "save", { row: bound("item"), other: bound("$node.s9.element"), input: bound("query") });
    const unfed = graph([{ id: "start", definitionId: "builtin.control.start" }, forEach("each"), loose], [edge("start", "each"), edge("each", "save", "body"), edge("save", "each")]);
    expect(automationStudioTargetLineage(graph([loose], []), loose)).toBeUndefined();
    expect(automationStudioTargetLineage(unfed, loose)).toBeUndefined();
  });
});
