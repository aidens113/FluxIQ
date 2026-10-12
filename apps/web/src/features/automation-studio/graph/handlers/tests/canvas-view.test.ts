// What the canvas draws for the worked examples: the Handlers area, each
// Handler's card, the hook ports on the steps a Handler covers, and the entry
// and checkpoint markers.
import { describe, expect, it } from "vitest";
import { WORKED_EXAMPLE, workedExampleGraph, workedExampleNodeId } from "./worked-example-graphs";
import { EMPTY_FLOW_HANDLER_CANVAS_VIEW, flowHandlerCanvasView } from "../canvas-view";
import { handlerGraphFromSavedFlow } from "../source-graph";

describe("the canvas's handler view", () => {
  it("draws the checkpoint example's handler apart, with its card, hook port and checkpoint", () => {
    const saved = workedExampleGraph(WORKED_EXAMPLE.checkpoint);
    const id = (key: string) => workedExampleNodeId(saved, key);
    const view = flowHandlerCanvasView(handlerGraphFromSavedFlow(saved.flow)!);
    expect([...view.areaNodeIds].sort()).toEqual([id("h1-s1"), id("h1-s2"), id("h1-s3")].sort());
    expect([...view.registrationNodeIds]).toEqual([id("h1-s1")]);
    expect(view.cards.get(id("h1-s1"))).toEqual({
      nodeId: id("h1-s1"),
      title: "Handler",
      readable: true,
      eventWords: "Before trying again",
      scopeWords: "One step",
      conditionWords: "something on the page is there",
      thenWords: ["Go back to “search”"],
      stepCount: 1
    });
    expect(view.hookPorts.get(id("s3"))).toEqual([{ event: "retry", eventWords: "Before trying again", handlerNodeId: id("h1-s1"), handlerTitle: "Handler" }]);
    expect(view.hookPorts.has(id("s2"))).toBe(false);
    expect(view.markers.get(id("s2"))).toEqual([{ kind: "checkpoint", label: "Checkpoint", detail: "A handler can bring the run back here" }]);
  });

  it("shows the second known way as a failure handler that uses other results", () => {
    const saved = workedExampleGraph(WORKED_EXAMPLE.alternative);
    const view = flowHandlerCanvasView(handlerGraphFromSavedFlow(saved.flow)!);
    const card = view.cards.get(workedExampleNodeId(saved, "h1-s1"))!;
    expect([card.eventWords, card.conditionWords, card.thenWords]).toEqual(["When a step fails", "Always", ["Use other results"]]);
    expect(view.hookPorts.get(workedExampleNodeId(saved, "s2"))?.map((port) => port.eventWords)).toEqual(["When a step fails"]);
    expect(view.areaNodeIds.has(workedExampleNodeId(saved, "s1"))).toBe(false);
  });

  it("marks the alternative start with its condition, and draws no Handlers area without a Handler", () => {
    const saved = workedExampleGraph(WORKED_EXAMPLE.entry);
    const view = flowHandlerCanvasView(handlerGraphFromSavedFlow(saved.flow)!);
    expect(view.areaNodeIds.size).toBe(0);
    expect(view.markers.get(workedExampleNodeId(saved, "s3"))).toEqual([{ kind: "entry", label: "Alternative start", detail: "Starts here when something on the page is there" }]);
  });

  it("describes the recovery part's handler as one for the whole automation", () => {
    const view = flowHandlerCanvasView(handlerGraphFromSavedFlow(workedExampleGraph(WORKED_EXAMPLE.interruption, "recovery").flow, "recovery")!);
    const [card] = [...view.cards.values()];
    expect(card).toMatchObject({ eventWords: "Before a step", scopeWords: "Whole automation", conditionWords: "the “Session expiring” dialog is showing", thenWords: ["Carry on"] });
  });

  it("is the shared empty view for a graph with nothing to show", () => {
    expect(flowHandlerCanvasView({ graphId: "g", name: "", nodes: [{ id: "a", label: "a", parameterValues: {}, metadata: {} }], edges: [] })).toBe(EMPTY_FLOW_HANDLER_CANVAS_VIEW);
  });
});
