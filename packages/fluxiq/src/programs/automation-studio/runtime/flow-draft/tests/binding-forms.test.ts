// The forms a model writes a binding in, and the `$state` Core stores them as.
// A row field and a Flow input become the executor's own state bindings, so
// nothing new runs at run time; anything else written in a form's place is
// refused by where it sits, never passed on as a literal.
import { describe, expect, it } from "vitest";
import {
  automationStudioFlowDraftHoldsBinding,
  automationStudioFlowDraftIsBindingForm,
  automationStudioFlowDraftStoredBindingKind,
  automationStudioFlowDraftStoredBindings,
  automationStudioFlowDraftTranslateBindings
} from "../binding-forms.ts";

describe("translating the model's binding forms", () => {
  it("turns a row field and a Flow input into state bindings, at any depth, and leaves every other value alone", () => {
    const { parameters, refused } = automationStudioFlowDraftTranslateBindings({
      query: { $input: "query", test: "blue towels" },
      limit: 5,
      filters: [{ field: "name", value: { $row: "name" } }],
      nested: { deeper: { count: { $input: "count", test: 3 } } }
    });
    expect(refused).toEqual([]);
    expect(parameters).toEqual({
      query: { $state: { path: "query", fallback: "blue towels" } },
      limit: 5,
      filters: [{ field: "name", value: { $state: { path: "item.name" } } }],
      nested: { deeper: { count: { $state: { path: "count", fallback: 3 } } } }
    });
  });

  it("passes a stored state binding through untouched", () => {
    const stored = { $state: { path: "query", fallback: "x" } };
    expect(automationStudioFlowDraftTranslateBindings({ query: stored })).toEqual({ parameters: { query: stored }, refused: [] });
  });

  it("refuses an earlier step's output as not yet available", () => {
    const { refused } = automationStudioFlowDraftTranslateBindings({ name: { $step: 4, output: "records", path: "0.name" } });
    expect(refused).toEqual([{ path: "name", reason: "step_binding_not_yet" }]);
  });

  it("refuses malformed forms by the path they sit at", () => {
    const { refused, parameters } = automationStudioFlowDraftTranslateBindings({
      a: { $input: "Query", test: "x" },
      b: { $input: "item", test: "x" },
      c: { $input: "query" },
      d: { $input: "query", test: "x", extra: true },
      e: { $row: "first.name" },
      f: { $row: "" },
      g: { $row: 3 },
      h: { $row: "name", $input: "name", test: "x" },
      i: [{ $input: "q", test: null }],
      j: { $input: "q", test: { $row: "name" } },
      k: { $input: "a".repeat(33), test: "x" },
      l: { $row: "x".repeat(65) }
    });
    expect(refused).toEqual(["a", "b", "c", "d", "e", "f", "g", "h", "i.0", "j", "k", "l"].map((path) => ({ path, reason: "malformed" })));
    // A refused form is never carried on as a literal value.
    expect(parameters.a).toBeUndefined();
  });

  it("accepts the edges of the name rules", () => {
    const { refused } = automationStudioFlowDraftTranslateBindings({
      a: { $input: `q${"A".repeat(31)}`, test: "x" },
      b: { $row: "x".repeat(64) },
      c: { $row: "product-name" }
    });
    expect(refused).toEqual([]);
  });
});

describe("reading bindings back", () => {
  it("says whether a value holds any form or stored binding", () => {
    expect(automationStudioFlowDraftHoldsBinding({ a: [{ b: { $row: "x" } }] })).toBe(true);
    expect(automationStudioFlowDraftHoldsBinding({ a: { $input: "q", test: 1 } })).toBe(true);
    expect(automationStudioFlowDraftHoldsBinding({ a: { $step: 1 } })).toBe(true);
    expect(automationStudioFlowDraftHoldsBinding({ a: { $state: { path: "q" } } })).toBe(true);
    expect(automationStudioFlowDraftHoldsBinding({ a: "plain", b: [1, { c: null }] })).toBe(false);
    expect(automationStudioFlowDraftHoldsBinding(undefined)).toBe(false);
    expect(automationStudioFlowDraftIsBindingForm({ $row: "x" })).toBe(true);
    expect(automationStudioFlowDraftIsBindingForm({ $state: { path: "x" } })).toBe(false);
  });

  it("tells a row binding from a Flow input, and neither from any other state binding", () => {
    expect(automationStudioFlowDraftStoredBindingKind({ $state: { path: "item.name" } })).toEqual({ kind: "row", field: "name" });
    expect(automationStudioFlowDraftStoredBindingKind({ $state: { path: "query", fallback: "towels" } })).toEqual({ kind: "input", name: "query", test: "towels" });
    expect(automationStudioFlowDraftStoredBindingKind({ $state: { path: "query" } })).toBeUndefined();
    expect(automationStudioFlowDraftStoredBindingKind({ $state: { path: "@s4.records.0" } })).toBeUndefined();
    expect(automationStudioFlowDraftStoredBindingKind({ $state: { path: "item.a.b" } })).toBeUndefined();
    expect(automationStudioFlowDraftStoredBindingKind("item.name")).toBeUndefined();
  });

  it("lists every stored binding with the path it sits at", () => {
    expect(automationStudioFlowDraftStoredBindings({ q: { $state: { path: "query", fallback: "x" } }, rows: [{ v: { $state: { path: "item.name" } } }] })).toEqual([
      { path: "q", binding: { kind: "input", name: "query", test: "x" } },
      { path: "rows.0.v", binding: { kind: "row", field: "name" } }
    ]);
  });
});
