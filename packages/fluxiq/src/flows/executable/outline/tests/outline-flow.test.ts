import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioFlowInterface } from "../../interface/index.ts";
import { outlineFlow } from "../outline-flow.ts";
import type { FlowOutlineOptions, OutlineStep } from "../types/index.ts";
import { outlineFlatSteps } from "../walk/index.ts";
import { act, chain, edge, graph, node, placements, readable } from "./graph-fixture.ts";

const listings: AutomationStudioFlowInterface = {
  inputs: [
    { id: "query", name: "query", valueType: { kind: "string" }, required: true },
    { id: "count", name: "count", valueType: { kind: "number" } }
  ],
  outputs: [{ id: "listings", name: "listings", valueType: { kind: "array", item: { kind: "record", properties: { title: { kind: "string" }, price: { kind: "number" } } } } }]
};

const describeOutput: NonNullable<FlowOutlineOptions["describeOutput"]> = (outputId, params) => (outputId === "site.output.type" ? `Type ${words(params.text)} into “Search”` : undefined);

function words(value: JsonObject[string] | undefined): string {
  if (value && typeof value === "object" && !Array.isArray(value) && "$state" in value) return `{${String((value.$state as JsonObject).path)}}`;
  return String(value);
}

function everyNodeOnce(nodes: readonly { id: string }[], outline: ReturnType<typeof outlineFlow>): void {
  const placed = placements(outline);
  expect([...placed.keys()].sort()).toEqual(nodes.map((candidate) => candidate.id).sort());
  expect([...placed.values()].every((count) => count === 1)).toBe(true);
}

function stepNumbered(steps: readonly OutlineStep[], number: string): OutlineStep | undefined {
  return outlineFlatSteps(steps).find((step) => step.number === number);
}

describe("outlineFlow", () => {
  it("lists a linear Flow and hides its start and end", () => {
    const nodes = [
      node("start", "builtin.control.start"),
      act("open", "Open the market page", {}, "site.output.open"),
      act("type", "s2 dom-type", { text: { $state: { path: "query" } } }, "site.output.type"),
      act("press", "Press the search button"),
      node("end", "builtin.control.end")
    ];
    const flow = graph(nodes, chain("start", "open", "type", "press", "end"));
    const outline = outlineFlow(flow, { describeOutput });
    expect(readable(outline)).toEqual(["1 Open the market page", "2 Type {query} into “Search”", "3 Press the search button"]);
    expect(outline.steps[0]!.nodeIds).toEqual(["open", "start"]);
    expect(outline.steps[2]!.nodeIds).toEqual(["press", "end"]);
    expect(outline.issues).toEqual([]);
    everyNodeOnce(nodes, outline);
  });

  it("says the plain name of a step whose label is not plain words, and gives back the outputs", () => {
    const nodes = [node("start", "builtin.control.start"), act("type", "s2 dom-type", {}, "web.output.dom-type"), node("end", "builtin.control.end")];
    const outline = outlineFlow(graph(nodes, chain("start", "type", "end"), listings));
    expect(readable(outline)).toEqual(["1 Dom type", "2 Give back listings"]);
    expect(outline.interface).toEqual({
      needs: [{ id: "query", name: "query", type: "text", required: true }, { id: "count", name: "count", type: "number", required: false }],
      gives: [{ id: "listings", name: "listings", type: "a list of { title, price }", required: false }]
    });
    expect(outline.steps[1]!.kind).toBe("give-back");
    everyNodeOnce(nodes, outline);
  });

  it("nests a branch's paths up to where they meet and carries on after it", () => {
    const nodes = [
      node("start", "builtin.control.start"),
      node("ships", "builtin.logic.compare", { label: "The listing ships to the country" }),
      node("check", "builtin.control.branch"),
      act("keep", "Keep the listing"),
      act("skip", "Note the listing was skipped"),
      node("join", "builtin.control.merge"),
      act("next", "Go to the next page"),
      node("end", "builtin.control.end")
    ];
    const edges = [
      ...chain("start", "check"),
      edge("ships", "check", "result", "condition"),
      edge("check", "keep", "true"),
      edge("check", "skip", "false"),
      ...chain("keep", "join"),
      ...chain("skip", "join"),
      ...chain("join", "next", "end")
    ];
    const outline = outlineFlow(graph(nodes, edges));
    expect(readable(outline)).toEqual([
      "1 Only if the listing ships to the country:",
      "  1.1 Keep the listing",
      "  Otherwise:",
      "    1.2 Note the listing was skipped",
      "2 Go to the next page"
    ]);
    expect(outline.steps[0]!.nodeIds).toEqual(["check", "start", "join", "ships"]);
    everyNodeOnce(nodes, outline);
  });

  it("gives a switch an arm for its cases and one for the rest", () => {
    const nodes = [
      node("start", "builtin.control.start"),
      node("kind", "builtin.control.switch", { parameterValues: { value: { $state: { path: "condition" } }, cases: [{ value: "new" }, { value: "used" }] } }),
      act("listed", "Read the listed price"),
      act("ask", "Ask for a price"),
      node("join", "builtin.control.merge"),
      node("end", "builtin.control.end")
    ];
    const edges = [...chain("start", "kind"), edge("kind", "listed", "case"), edge("kind", "ask", "default"), ...chain("listed", "join"), ...chain("ask", "join"), ...chain("join", "end")];
    const outline = outlineFlow(graph(nodes, edges));
    expect(readable(outline)).toEqual([
      "1 Depending on {condition}:",
      "  When it is “new” or “used”:",
      "    1.1 Read the listed price",
      "  Otherwise:",
      "    1.2 Ask for a price"
    ]);
    everyNodeOnce(nodes, outline);
  });

  it("nests a For Each's body, with a branch inside it, and carries on by done", () => {
    const nodes = [
      node("start", "builtin.control.start"),
      act("read", "Read the list of results", {}, "site.output.read-list"),
      node("each", "builtin.control.for-each", { parameterValues: { stopAfter: { $state: { path: "count" } } } }),
      node("ships", "builtin.control.branch", { label: "Ships to {country}" }),
      act("keep", "Keep the title, price and link"),
      node("sort", "builtin.control.call-subflow", { parameterValues: { subflowId: "sort-cheapest" } }),
      node("end", "builtin.control.end")
    ];
    const edges = [
      ...chain("start", "read", "each"),
      edge("read", "each", "records", "items"),
      edge("each", "ships", "body"),
      edge("ships", "keep", "true"),
      edge("ships", "each", "false"),
      ...chain("keep", "each"),
      edge("each", "sort", "done"),
      ...chain("sort", "end")
    ];
    const outline = outlineFlow(graph(nodes, edges), { describeFlow: (link) => (link.id === "sort-cheapest" ? { name: "Sort and keep cheapest" } : undefined) });
    expect(readable(outline)).toEqual([
      "1 Read the list of results",
      "2 For each item in “Read the list of results”, up to {count}:",
      "  2.1 Only if ships to {country}:",
      "    2.1.1 Keep the title, price and link",
      "3 Run Flow ▸ Sort and keep cheapest"
    ]);
    expect(stepNumbered(outline.steps, "3")!.link).toEqual({ kind: "subflow", id: "sort-cheapest" });
    expect(outline.issues).toEqual([]);
    everyNodeOnce(nodes, outline);
  });

  it("puts handlers in a closing section", () => {
    const nodes = [
      node("start", "builtin.control.start"),
      act("press", "Press the search button"),
      node("end", "builtin.control.end"),
      node("on-fail", "builtin.control.handler", { parameterValues: { event: "fail" } }),
      node("close", "builtin.control.call-subflow", { label: "Close cookie banner", parameterValues: { subflowId: "close-banner" } }),
      node("resume", "builtin.control.handler-end", { parameterValues: { disposition: "resume" } })
    ];
    const edges = [...chain("start", "press", "end"), edge("on-fail", "close", "body"), ...chain("close", "resume")];
    const outline = outlineFlow(graph(nodes, edges));
    expect(readable(outline)).toEqual([
      "1 Press the search button",
      "If something goes wrong:",
      "  2 When a step fails:",
      "    2.1 Run Flow ▸ Close cookie banner",
      "    2.2 Then carry on with the step"
    ]);
    expect(outline.steps.at(-1)!.kind).toBe("handlers");
    everyNodeOnce(nodes, outline);
  });

  it("links every kind of calling step by the Flow it runs", () => {
    const nodes = [
      node("start", "builtin.control.start"),
      node("published", "composite.flow.prices@1.0.0", { metadata: { "fluxiq.callFlow": { target: { flowId: "prices", version: "1.0.0", scope: { kind: "global" } } } } }),
      node("part", "builtin.control.call-subflow", { parameterValues: { part: { partId: "part-7", version: 2 } } }),
      node("call", "builtin.control.call-flow", { parameterValues: { target: { flowId: "flow-9" } } }),
      node("named", "builtin.control.call-flow", { parameterValues: { target: { fluxNode: "market.cheapest" } } }),
      node("end", "builtin.control.end")
    ];
    const outline = outlineFlow(graph(nodes, chain("start", "published", "part", "call", "named", "end")), {
      describeFlow: (link) => (link.kind === "flow" && link.id === "prices" ? { name: "Read prices", lastingClasses: ["send_or_publish"] } : undefined)
    });
    expect(readable(outline)).toEqual(["1 Run Flow ▸ Read prices", "2 Run Flow ▸ another Flow", "3 Run Flow ▸ another Flow", "4 Run Flow ▸ market.cheapest"]);
    expect(outline.steps.map((step) => step.link)).toEqual([
      { kind: "flow", id: "prices" },
      { kind: "part", id: "part-7" },
      { kind: "flow", id: "flow-9" },
      { kind: "fluxnode", id: "market.cheapest" }
    ]);
    expect(outline.steps[0]!.lasting).toEqual(["send_or_publish"]);
    everyNodeOnce(nodes, outline);
  });

  it("turns a router's routes into the arms of a first step", () => {
    const nodes = [node("start", "builtin.control.start"), act("press", "Press the search button"), node("end", "builtin.control.end")];
    const rule = (ruleId: string, name: string, order: number, status: "active" | "disabled", subflowId: string) => ({ schemaVersion: "0.1" as const, ruleId, routerId: "router", name, target: { kind: "subflow" as const, subflowId }, order, status, createdAt: 0, updatedAt: 0 });
    const outline = outlineFlow(graph(nodes, chain("start", "press", "end")), {
      router: { rules: [rule("b", "Results page", 2, "active", "results"), rule("a", "Search page", 1, "active", "search"), rule("c", "Old page", 0, "disabled", "old")], fallback: { kind: "fail" } },
      describeFlow: (link) => ({ name: link.id === "search" ? "Search" : "Read results" })
    });
    expect(readable(outline)).toEqual([
      "1 Choose which part runs:",
      "  When “Search page” applies:",
      "    1.1 Run Flow ▸ Search",
      "  When “Results page” applies:",
      "    1.2 Run Flow ▸ Read results",
      "  Otherwise:",
      "    1.3 Stop here: no route fits",
      "2 Press the search button"
    ]);
    everyNodeOnce(nodes, outline);
  });

  it("outlines a pipeline graph, which has no start, with fixed sentences", () => {
    const step = (id: string, declaration: JsonObject) => node(id, "builtin.data.pipeline-step", { label: `${String(declaration.kind)} (${id})`, parameterValues: { step: declaration } });
    const nodes = [
      node("__source", "builtin.data.pipeline-source", { parameterValues: { source: { kind: "input", field: "rows" } } }),
      step("cheap", { kind: "filter", where: { op: "lte", args: [{ field: "price" }, { value: 20 }] } }),
      step("order", { kind: "sort", by: [{ field: "price", order: "asc" }] }),
      step("top", { kind: "limit", count: 10 }),
      step("keep", { kind: "sink", to: { kind: "dataset", name: "cheapest" } })
    ];
    const outline = outlineFlow(graph(nodes, chain("__source", "cheap", "order", "top", "keep")));
    expect(readable(outline)).toEqual([
      "1 Load the records",
      "2 Keep rows where price is at most 20",
      "3 Sort by price, lowest first",
      "4 Keep the first 10",
      "5 Save to dataset “cheapest”"
    ]);
    expect(outline.steps.every((candidate) => candidate.kind === "data")).toBe(true);
    everyNodeOnce(nodes, outline);
  });

  it("never hides a jump back that is not a loop, or a step the start does not reach", () => {
    const nodes = [
      node("start", "builtin.control.start"),
      act("open", "Open the page"),
      act("press", "Press the search button"),
      act("read", "Read the results"),
      node("end", "builtin.control.end"),
      act("orphan", "Close the dialog")
    ];
    const edges = [...chain("start", "open", "press", "read"), edge("read", "end", "success"), edge("read", "open", "failed")];
    const outline = outlineFlow(graph(nodes, edges));
    expect(readable(outline)).toEqual([
      "1 Open the page",
      "2 Press the search button",
      "3 Read the results",
      "  If that does not work:",
      "    3.1 Go back to step 1",
      "These steps do not run from the start:",
      "  4 Close the dialog"
    ]);
    expect(outline.issues.map((issue) => [issue.code, issue.words, issue.step])).toEqual([
      ["unreached", "Some steps do not run from the start. This part is clearer in the graph", undefined],
      ["unstructured", "This part is clearer in the graph", "3.1"]
    ]);
    everyNodeOnce(nodes, outline);
  });

  it("says a forward jump out of a loop as going to a later step", () => {
    const nodes = [
      node("start", "builtin.control.start"),
      node("each", "builtin.control.for-each"),
      act("check", "Check the listing"),
      act("after", "Save the results"),
      node("end", "builtin.control.end")
    ];
    const edges = [...chain("start", "each"), edge("each", "check", "body"), edge("check", "each", "success"), edge("check", "after", "failed"), edge("each", "after", "done"), ...chain("after", "end")];
    const outline = outlineFlow(graph(nodes, edges));
    expect(readable(outline)).toEqual([
      "1 For each item in the list:",
      "  1.1 Check the listing",
      "    If that does not work:",
      "      1.1.1 Go to step 2",
      "2 Save the results"
    ]);
    everyNodeOnce(nodes, outline);
  });
});
