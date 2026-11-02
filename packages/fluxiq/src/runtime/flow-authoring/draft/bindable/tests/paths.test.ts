// The paths a kept step offers `bind`: values the shown, model-safe input and
// the argument the step runs with hold alike, at the same path.
//
// Live run B7 (t262, decisions 0019-0055) bound a click's `target` five times
// as the draft showed it; the click ran with a resolved selector and element,
// so `target` was no value it ran with and every bind was refused
// `bind_new_key`. The list is what the draft and the refusal point at instead
// (`docs/working/mvp-live-continuation-2026-10-03/reports/b7-binding-feedback-causality.md`).

import { describe, expect, it } from "vitest";
import { automationStudioFlowDraftBindablePaths } from "../index.ts";

describe("the paths a kept step offers bind", () => {
  it("offers a typed value the step ran with, and never the shown control or the private identity it resolved to", () => {
    const step = {
      input: { node: "fixture.type", parameters: { target: { handle: "fixture-handle" }, text: "fixture-text" }, consequences: [] },
      ranWith: { node: "fixture.type", parameters: { selector: "private-locator", element: { identity: "private-identity" }, text: "fixture-text" }, consequences: [] }
    };
    const before = structuredClone(step);
    const paths = automationStudioFlowDraftBindablePaths(step);
    expect(paths).toEqual(["text"]);
    expect(JSON.stringify(paths)).not.toMatch(/target|selector|element|private-/u);
    expect(step).toEqual(before);
  });

  it("offers a whole object the step ran with unchanged, and each value inside it", () => {
    const configuration = { label: "fixture", options: { count: 2 } };
    const argument = { parameters: { configuration } };
    expect(automationStudioFlowDraftBindablePaths({ input: structuredClone(argument), ranWith: structuredClone(argument) }))
      .toEqual(["configuration", "configuration.label", "configuration.options", "configuration.options.count"]);
  });

  it("offers nothing the step ran with a different value at", () => {
    const paths = automationStudioFlowDraftBindablePaths({
      input: { parameters: { query: "shown", list: { handle: "shown-handle" }, limit: 5 } },
      ranWith: { parameters: { query: "resolved", list: { handle: "resolved-handle" }, limit: 5 } }
    });
    expect(paths).toEqual(["limit"]);
  });

  it("offers a value already bound as one path, and nothing inside a binding or at a null", () => {
    const bound = { $state: { path: "query", fallback: "fixture-query" } };
    const argument = { parameters: { query: bound, note: null, options: { sort: { $state: { path: "item.sort" } }, page: 1 } } };
    expect(automationStudioFlowDraftBindablePaths({ input: structuredClone(argument), ranWith: structuredClone(argument) }))
      .toEqual(["query", "options.sort", "options.page"]);
  });

  it("offers an array as one value, never its items", () => {
    const argument = { parameters: { tags: ["a", "b"] } };
    expect(automationStudioFlowDraftBindablePaths({ input: structuredClone(argument), ranWith: structuredClone(argument) })).toEqual(["tags"]);
    expect(automationStudioFlowDraftBindablePaths({ input: { parameters: { tags: ["a", "b"] } }, ranWith: { parameters: { tags: ["a"] } } })).toEqual([]);
  });

  it("reads a generic tool's own input when it has no resolved argument", () => {
    expect(automationStudioFlowDraftBindablePaths({ input: { target: "fixture-target", text: "fixture-text" } })).toEqual(["target", "text"]);
  });

  it("offers nothing when the shown input has no parameters where the step's argument keeps them", () => {
    expect(automationStudioFlowDraftBindablePaths({ input: { text: "fixture-text" }, ranWith: { parameters: { text: "fixture-text" } } })).toEqual([]);
  });
});
