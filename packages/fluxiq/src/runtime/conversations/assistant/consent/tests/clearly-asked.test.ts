// The words-clearly-ask matcher: a class verb, the target named or selected,
// no more than the named items, and said as a request. Every doubt is a "no".

import { describe, expect, it } from "vitest";
import type { PanelAssistantTarget } from "../../types.ts";
import { panelAssistantClearlyAsked } from "../clearly-asked.ts";

const OLD_SEARCH: PanelAssistantTarget = { items: [{ kind: "Flow", id: "flow.old", name: "Old search", contextKey: "flowId" }] };

const asks = (words: string, target: PanelAssistantTarget | undefined = OLD_SEARCH, context = {}, classes: Parameters<typeof panelAssistantClearlyAsked>[0]["classes"] = ["delete"]) =>
  panelAssistantClearlyAsked({ words, classes, target, context });

describe("panelAssistantClearlyAsked", () => {
  it("reads a class verb with the target's name as clearly asking", () => {
    expect(asks("delete Old search")).toBe(true);
    expect(asks("Please remove the flow “Old search”.")).toBe(true);
    expect(asks("Can you erase 'old search'?")).toBe(true);
  });

  it("does not read words without a class verb as asking, however clear the target", () => {
    expect(asks("clean things up")).toBe(false);
    expect(asks("Old search is not needed any more")).toBe(false);
  });

  it("needs a verb for every gated class of the call", () => {
    expect(asks("delete Old search", OLD_SEARCH, {}, ["delete", "send"])).toBe(false);
    expect(asks("delete Old search and send the report", OLD_SEARCH, {}, ["delete", "send"])).toBe(true);
  });

  it("refuses a negation or a question that is not a request", () => {
    expect(asks("don't delete Old search")).toBe(false);
    expect(asks("do not delete Old search")).toBe(false);
    expect(asks("should I delete Old search?")).toBe(false);
  });

  it("accepts this or these only for exactly what is selected", () => {
    expect(asks("delete this", OLD_SEARCH, { flowId: "flow.old" })).toBe(true);
    expect(asks("delete this", OLD_SEARCH, { flowId: "flow.other" })).toBe(false);
    expect(asks("delete this", OLD_SEARCH, {})).toBe(false);
    expect(asks("delete it", OLD_SEARCH, { flowId: "flow.old" })).toBe(false);
  });

  it("refuses a call that affects more than the named items, or whose target is unknown", () => {
    const two: PanelAssistantTarget = { items: [...OLD_SEARCH.items, { kind: "Flow", id: "flow.new", name: "New search", contextKey: "flowId" }] };
    expect(asks("delete Old search", two)).toBe(false);
    expect(asks("delete Old search and New search", two)).toBe(true);
    expect(panelAssistantClearlyAsked({ words: "delete Old search", classes: ["delete"], target: undefined, context: {} })).toBe(false);
    expect(asks("delete Old search", { items: [] })).toBe(false);
    expect(asks("delete the run", { items: [{ kind: "run", id: "run.1" }] })).toBe(false);
  });

  it("matches a name only as a whole phrase", () => {
    expect(asks("delete Old searches")).toBe(false);
    expect(asks("delete Bold search")).toBe(false);
  });
});
