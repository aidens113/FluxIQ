// The handler views speak the product's plain words, never the stored codes.
import { describe, expect, it } from "vitest";
import {
  flowFactConditionWords,
  flowHandlerEventWords,
  flowHandlerLevelWords,
  flowHandlerRegistrationWords,
  flowHandlerScopeWords,
  flowHandlerThenWords
} from "../plain-words";
import type { FlowHandlerRegistration, HandlerGraph } from "../types";

const graph: HandlerGraph = {
  graphId: "g",
  name: "Main",
  nodes: [
    { id: "open", label: "Open the list", parameterValues: { target: { handle: "t5" } }, metadata: {} },
    { id: "save", label: "Save the row", parameterValues: {}, metadata: {} }
  ],
  edges: []
};

describe("handler plain words", () => {
  it("says when each event runs", () => {
    expect((["start", "before", "retry", "fail", "before_next"] as const).map(flowHandlerEventWords)).toEqual([
      "When a part starts",
      "Before a step",
      "Before trying again",
      "When a step fails",
      "After a step succeeds"
    ]);
  });

  it("says where a handler applies, naming steps by their labels", () => {
    expect(flowHandlerScopeWords({ kind: "automation" }, graph)).toBe("Whole automation");
    expect(flowHandlerScopeWords({ kind: "subflow", inherit: true }, graph)).toBe("This part");
    expect(flowHandlerScopeWords({ kind: "nodes", nodeIds: ["open"] }, graph)).toBe("Step “Open the list”");
    expect(flowHandlerScopeWords({ kind: "nodes", nodeIds: ["open", "save"] }, graph)).toBe("Steps “Open the list”, “Save the row”");
  });

  it("says what happens next for each disposition", () => {
    expect(flowHandlerThenWords({ disposition: "resume" })).toBe("Carry on");
    expect(flowHandlerThenWords({ disposition: "route", checkpointId: "search" })).toBe("Go back to “search”");
    expect(flowHandlerThenWords({ disposition: "resolve", outputs: { reference: 1 } })).toBe("Use other results");
    expect(flowHandlerThenWords({ disposition: "unhandled" })).toBe("Give up");
    expect(flowHandlerThenWords({})).toBe("Give up");
  });

  it("summarises conditions without the target's handle", () => {
    expect(flowFactConditionWords([], graph)).toBe("Always");
    expect(flowFactConditionWords([{ fact: "dialog", op: "visible", target: { kind: "dialog", role: "alertdialog", name: "Session expiring" } }], graph)).toBe("the “Session expiring” dialog is showing");
    expect(flowFactConditionWords([{ fact: "exists", op: "exists", target: { handle: "t5" } }, { fact: "absent", op: "absent", target: { handle: "t9" } }], graph))
      .toBe("what “Open the list” acts on is there and something on the page is gone");
    expect(flowFactConditionWords([{ fact: "text", op: "contains", value: "Booked", target: { handle: "t5" } }], graph)).toBe("the text of what “Open the list” acts on contains “Booked”");
    expect(flowFactConditionWords([{ fact: "value", op: "equals", value: { input: "city" }, target: { handle: "t5" } }], graph)).toBe("the value of what “Open the list” acts on is the input “city”");
    expect(flowFactConditionWords([{ fact: "count", op: "count", value: 3, target: { handle: "t5" } }], graph)).toBe("there are 3 of what “Open the list” acts on");
    for (const words of [flowFactConditionWords([{ fact: "exists", op: "exists", target: { handle: "t9" } }], graph)]) expect(words).not.toMatch(/t9/u);
  });

  it("names where an effective handler was found and what an implicit one does", () => {
    expect(flowHandlerLevelWords("node", "")).toBe("This step");
    expect(flowHandlerLevelWords("subflow", "")).toBe("This part");
    expect(flowHandlerLevelWords("ancestor", "Checkout")).toBe("A part that calls this one: “Checkout”");
    expect(flowHandlerLevelWords("automation", "")).toBe("Whole automation");
    const base: Omit<FlowHandlerRegistration, "source"> = { handlerId: "g/x", graphId: "g", event: "fail", scope: { kind: "nodes", nodeIds: ["open"] }, when: [], order: 0, completionCheck: [], maxRuns: 1, documentIndex: 0 };
    expect(flowHandlerRegistrationWords({ ...base, source: { kind: "failed_edge", nodeId: "open", edgeId: "e", targetNodeId: "save", wayOn: false } }, graph)).toBe("Its own failure route to “Save the row”");
    expect(flowHandlerRegistrationWords({ ...base, source: { kind: "failed_edge", nodeId: "open", edgeId: "e", targetNodeId: "save", wayOn: true } }, graph)).toBe("Skip this optional step");
    expect(flowHandlerRegistrationWords({ ...base, source: { kind: "clears_interference", nodeId: "save" } }, graph)).toBe("Clear what is in the way with “Save the row”");
  });
});
