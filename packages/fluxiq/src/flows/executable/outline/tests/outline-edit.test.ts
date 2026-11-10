// Each edit made on the outline, round trip: the edit becomes a patch, the
// patch is applied to the graph as the graph store applies it, and the
// outline of the patched graph shows the change, with every node still in
// exactly one step.
import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowInterface } from "../../interface/index.ts";
import { outlineEdit } from "../outline-edit.ts";
import { outlineFlow } from "../outline-flow.ts";
import type { FlowOutlineOptions, OutlineEdit, OutlineEditResult } from "../types/index.ts";
import { applyOperations } from "./apply-operations.ts";
import { act, chain, graph, node, placements, readable, type FixtureGraph } from "./graph-fixture.ts";

const searchInterface: AutomationStudioFlowInterface = { inputs: [{ id: "query", name: "query", valueType: { kind: "string" }, required: true }], outputs: [] };

const describeOutput: NonNullable<FlowOutlineOptions["describeOutput"]> = (outputId, params) => (outputId === "site.output.type" ? `Type ${said(params.text)} into “Search”` : undefined);

function said(value: JsonValue | undefined): string {
  if (value && typeof value === "object" && !Array.isArray(value) && "$state" in value) {
    const state = value.$state;
    return state && typeof state === "object" && !Array.isArray(state) ? `{${String(state.path)}}` : "?";
  }
  return `“${String(value)}”`;
}

function search(extra: { interface?: AutomationStudioFlowInterface } = {}): FixtureGraph {
  return graph(
    [
      node("start", "builtin.control.start"),
      act("open", "Open the market page", {}, "site.output.open"),
      act("type", "Type the words", { text: "lamp" }, "site.output.type"),
      act("press", "Press the search button"),
      node("end", "builtin.control.end")
    ],
    chain("start", "open", "type", "press", "end"),
    extra.interface ?? searchInterface
  );
}

/** The outline after the edit's patch is applied, failing when the edit was refused. */
function roundTrip(flow: FixtureGraph, edit: OutlineEdit): { after: FixtureGraph; lines: string[]; result: OutlineEditResult } {
  const result = outlineEdit(outlineFlow(flow, { describeOutput }), flow, edit);
  if (!result.ok) throw new Error(`Refused: ${result.reason}`);
  const after = applyOperations(flow, result.operations);
  const outline = outlineFlow(after, { describeOutput });
  const placed = placements(outline);
  expect(after.nodes.every((candidate) => placed.get(candidate.id) === 1)).toBe(true);
  return { after, lines: readable(outline), result };
}

function refusal(flow: FixtureGraph, edit: OutlineEdit): string {
  const result = outlineEdit(outlineFlow(flow, { describeOutput }), flow, edit);
  return result.ok ? "not refused" : result.reason;
}

describe("outlineEdit", () => {
  it("changes a value, keeping the step's other values", () => {
    const { lines, after, result } = roundTrip(search(), { kind: "set-value", step: "2", path: ["text"], value: "desk" });
    expect(lines).toEqual(["1 Open the market page", "2 Type “desk” into “Search”", "3 Press the search button"]);
    expect(after.nodes.find((candidate) => candidate.id === "type")!.parameterValues).toEqual({ outputId: "site.output.type", parameters: { text: "desk" } });
    expect(result.ok && result.operations.map((operation) => operation.op)).toEqual(["set_node_parameters"]);
  });

  it("binds a value to an input, keeping the old value as its fallback", () => {
    const { lines, after } = roundTrip(search(), { kind: "bind-input", step: "2", path: ["text"], input: "query" });
    expect(lines[1]).toBe("2 Type {query} into “Search”");
    expect(after.nodes.find((candidate) => candidate.id === "type")!.parameterValues?.parameters).toEqual({ text: { $state: { path: "query", fallback: "lamp" } } });
    expect(refusal(search(), { kind: "bind-input", step: "2", path: ["text"], input: "country" })).toBe("This Flow has no input called “country”.");
  });

  it("changes a step's words with set_node_label", () => {
    const { lines, result } = roundTrip(search(), { kind: "set-words", step: "3", words: "  Press   “Search”  " });
    expect(lines[2]).toBe("3 Press “Search”");
    expect(result.ok && result.operations).toEqual([{ op: "set_node_label", nodeId: "press", label: "Press “Search”" }]);
    expect(refusal(search(), { kind: "set-words", step: "3", words: "   " })).toBe("A step needs some words.");
  });

  it("moves a step up and down inside its block", () => {
    expect(roundTrip(search(), { kind: "move", step: "3", direction: "up" }).lines).toEqual(["1 Open the market page", "2 Press the search button", "3 Type “lamp” into “Search”"]);
    expect(roundTrip(search(), { kind: "move", step: "1", direction: "down" }).lines).toEqual(["1 Type “lamp” into “Search”", "2 Open the market page", "3 Press the search button"]);
    expect(refusal(search(), { kind: "move", step: "1", direction: "up" })).toBe("Step 1 is already first in its part.");
  });

  it("refuses a move that would put a step before the value it uses", () => {
    const flow = search();
    flow.nodes = flow.nodes.map((candidate) => (candidate.id === "press" ? { ...candidate, parameterValues: { outputId: "site.output.press", parameters: { at: { $state: { path: "$node.type.result" } } } } } : candidate));
    expect(refusal(flow, { kind: "move", step: "3", direction: "up" })).toBe("Step 3 uses “result”, which step 2 gives, so it cannot go before it.");
  });

  it("deletes a step and joins the steps either side", () => {
    const { lines, after, result } = roundTrip(search(), { kind: "delete", step: "2" });
    expect(lines).toEqual(["1 Open the market page", "2 Press the search button"]);
    expect(after.edges.some((candidate) => candidate.sourceNodeId === "open" && candidate.targetNodeId === "press")).toBe(true);
    expect(result.ok && result.operations.map((operation) => operation.op)).toEqual(["delete_node", "add_edge"]);
  });

  it("refuses to delete the only source of an output", () => {
    const flowInterface: AutomationStudioFlowInterface = { inputs: [], outputs: [{ id: "rows", name: "rows", valueType: { kind: "json" }, metadata: { binding: { $state: { path: "$node.press.records" } } } }] };
    expect(refusal(search({ interface: flowInterface }), { kind: "delete", step: "3" })).toBe("Step 3 is where “rows” comes from, so it cannot be deleted.");
  });

  it("adds a Run Flow step after a step, linked by the Flow's id", () => {
    const { lines, after } = roundTrip(search(), { kind: "add-call", after: "1", flow: { flowId: "flow-close", name: "Close cookie banner" } });
    expect(lines).toEqual(["1 Open the market page", "2 Run Flow ▸ Close cookie banner", "3 Type “lamp” into “Search”", "4 Press the search button"]);
    const outline = outlineFlow(after);
    expect(outline.steps[1]!.link).toEqual({ kind: "flow", id: "flow-close" });
  });

  it("adds a data step first, or after a loop once it is done", () => {
    expect(roundTrip(search(), { kind: "add-data", data: { kind: "sort", by: [{ field: "price", order: "asc" }] } }).lines[0]).toBe("1 Sort by price, lowest first");
    const looped = graph(
      [node("start", "builtin.control.start"), node("each", "builtin.control.for-each"), act("keep", "Keep the row"), node("end", "builtin.control.end")],
      [...chain("start", "each"), { id: "body", sourceNodeId: "each", targetNodeId: "keep", sourcePortId: "body" }, ...chain("keep", "each"), { id: "done", sourceNodeId: "each", targetNodeId: "end", sourcePortId: "done" }]
    );
    expect(roundTrip(looped, { kind: "add-data", after: "1", data: { kind: "limit", count: 10 } }).lines).toEqual(["1 For each item in the list:", "  1.1 Keep the row", "2 Keep the first 10"]);
    expect(refusal(search(), { kind: "add-data", after: "1", data: { kind: "join" } as unknown as Extract<OutlineEdit, { kind: "add-data" }>["data"] })).toBe("That kind of data step cannot be added here.");
  });

  it("answers an edit of a step that does not exist with a reason", () => {
    expect(refusal(search(), { kind: "delete", step: "9" })).toBe("There is no step 9.");
  });
});
