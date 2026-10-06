// The forms a model writes a binding in, and the `$state` Core stores them as.
// A row field and a Flow input become the executor's own state bindings, so
// nothing new runs at run time; anything else written in a form's place is
// refused by where it sits, never passed on as a literal.
import { describe, expect, it } from "vitest";
import { resolveAutomationNodeParameterValues } from "../../../nodes/index.ts";
import {
  automationStudioFlowDraftHoldsBinding,
  automationStudioFlowDraftIsBindingForm,
  automationStudioFlowDraftStepOutputsState,
  automationStudioFlowDraftStoredBindingKind,
  automationStudioFlowDraftStoredBindings,
  automationStudioFlowDraftTranslateBindings,
  type AutomationStudioFlowDraftBindingContext
} from "../binding-forms.ts";
import type { AutomationStudioFlowDraftStep } from "../step.ts";

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

// P5 (t270): an earlier step's output. The model writes `{"$step": n,
// "output": "<port>"}` (with `"path"` for one field of a record output), and
// the form is translated against the draft as it stands when it is written:
// position n becomes the step's own id, which no reorder or withdrawal
// renumbers, so the stored binding keeps naming the step the model meant.
describe("an earlier step's output", () => {
  const ranStep = (position: number, over: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep => ({
    position,
    id: `d${position + 10}`,
    iteration: position,
    actionId: position === 2 ? "node.list" : "node.press",
    toolId: "core.run_node",
    input: { node: position === 2 ? "node.list" : "node.press", parameters: {} },
    effect: "mutate",
    effectApplied: true,
    proposes: true,
    disposition: "kept",
    ...over
  });
  const NODES: Record<string, { outputs: { id: string }[] }> = { "node.list": { outputs: [{ id: "records" }, { id: "first" }] }, "node.press": { outputs: [] } };
  const draft = (): AutomationStudioFlowDraftStep[] => [ranStep(1), ranStep(2), ranStep(3)];
  const context = (over: Partial<AutomationStudioFlowDraftBindingContext> = {}): AutomationStudioFlowDraftBindingContext => ({ steps: draft(), nodeOf: (id) => NODES[id], ...over });

  it("becomes a state binding naming the step's own id and its output, for a step about to be written", () => {
    const { parameters, refused } = automationStudioFlowDraftTranslateBindings({ values: { $step: 2, output: "records" }, name: { $step: 2, output: "first", path: "label" } }, context());
    expect(refused).toEqual([]);
    expect(parameters).toEqual({ values: { $state: { path: "$step.d12.records" } }, name: { $state: { path: "$step.d12.first.label" } } });
  });

  it("is refused without the draft it is written against, as before", () => {
    expect(automationStudioFlowDraftTranslateBindings({ v: { $step: 2, output: "records" } }).refused).toEqual([{ path: "v", reason: "step_binding_not_yet" }]);
  });

  it("refuses the step itself and every step after it, for a step already in the draft", () => {
    const { refused } = automationStudioFlowDraftTranslateBindings({ self: { $step: 2, output: "records" }, later: { $step: 3, output: "records" }, earlier: { $step: 1, output: "x" } }, context({ at: 2, nodeOf: undefined }));
    expect(refused).toEqual([{ path: "self", reason: "step_not_earlier" }, { path: "later", reason: "step_not_earlier" }]);
  });

  it("refuses a position no step holds, and a step that is out of the Flow, looked, or failed", () => {
    const steps = draft();
    steps[0]!.disposition = "dropped";
    const withdrawn = [...steps, ranStep(4, { disposition: "exploratory" }), ranStep(5, { proposes: false }), (({ proposes: _proposes, ...failed }) => failed)(ranStep(6, { effectApplied: false }))];
    const { refused } = automationStudioFlowDraftTranslateBindings({
      none: { $step: 9, output: "records" },
      dropped: { $step: 1, output: "records" },
      exploratory: { $step: 4, output: "records" },
      look: { $step: 5, output: "records" },
      failed: { $step: 6, output: "records" }
    }, { steps: withdrawn });
    expect(refused).toEqual([
      { path: "none", reason: "step_missing" },
      { path: "dropped", reason: "step_not_usable" },
      { path: "exploratory", reason: "step_not_usable" },
      { path: "look", reason: "step_not_usable" },
      { path: "failed", reason: "step_not_usable" }
    ]);
  });

  it("refuses an output the step's node does not declare, when the node is known", () => {
    expect(automationStudioFlowDraftTranslateBindings({ v: { $step: 2, output: "rows" } }, context()).refused).toEqual([{ path: "v", reason: "step_output_unknown" }]);
    expect(automationStudioFlowDraftTranslateBindings({ v: { $step: 1, output: "records" } }, context()).refused).toEqual([{ path: "v", reason: "step_output_unknown" }]);
  });

  it("refuses a malformed form: no output, a stray key, a position that is not a whole number, a list index or an empty field", () => {
    const { refused } = automationStudioFlowDraftTranslateBindings({
      a: { $step: 2 },
      b: { $step: 2, output: "records", extra: 1 },
      c: { $step: "2", output: "records" },
      d: { $step: 1.5, output: "records" },
      e: { $step: 0, output: "records" },
      f: { $step: 2, output: "records", path: "0.name" },
      g: { $step: 2, output: "first", path: "a..b" },
      h: { $step: 2, output: "re cords" },
      i: { $step: 2, output: "first", path: 3 }
    }, context());
    expect(refused).toEqual(["a", "b", "c", "d", "e", "f", "g", "h", "i"].map((path) => ({ path, reason: "malformed" })));
  });

  it("is read back as the step, the output and the field, and a stored one passes through untouched", () => {
    expect(automationStudioFlowDraftStoredBindingKind({ $state: { path: "$step.d12.records" } })).toEqual({ kind: "step", step: "d12", output: "records" });
    expect(automationStudioFlowDraftStoredBindingKind({ $state: { path: "$step.d12.first.label.text" } })).toEqual({ kind: "step", step: "d12", output: "first", path: "label.text" });
    expect(automationStudioFlowDraftStoredBindingKind({ $state: { path: "$step.d12" } })).toBeUndefined();
    expect(automationStudioFlowDraftStoredBindingKind({ $state: { path: "$step.d12.records", fallback: [] } })).toBeUndefined();
    const stored = { $state: { path: "$step.d12.records" } };
    expect(automationStudioFlowDraftTranslateBindings({ v: stored }, context())).toEqual({ parameters: { v: stored }, refused: [] });
  });

  it("gives the replay the outputs each step really produced, under the name its binding reads", () => {
    const state = automationStudioFlowDraftStepOutputsState([["d12", { records: [{ name: "Ada" }], first: { label: "Ada" } }]]);
    expect(resolveAutomationNodeParameterValues({ v: { $state: { path: "$step.d12.first.label" } }, w: { $state: { path: "$step.d12.records" } } }, state)).toEqual({ values: { v: "Ada", w: [{ name: "Ada" }] }, missingPaths: [] });
    expect(resolveAutomationNodeParameterValues({ v: { $state: { path: "$step.d13.records" } } }, state).missingPaths).toEqual(["$step.d13.records"]);
  });
});
