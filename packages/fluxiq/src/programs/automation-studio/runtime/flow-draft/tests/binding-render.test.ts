// A stored binding is shown back to the model in the form it wrote it, so the
// draft reads in one vocabulary and `$state` never reaches a request.
import { describe, expect, it } from "vitest";
import { automationStudioFlowDraftTranslateBindings } from "../binding-forms.ts";
import { automationStudioFlowDraftRenderBindings } from "../binding-render.ts";
import type { AutomationStudioFlowDraftStep } from "../step.ts";

describe("rendering stored bindings as the model's forms", () => {
  it("shows row and input bindings as written, at any depth, and leaves every other value alone", () => {
    const written = { query: { $input: "query", test: "blue towels" }, rows: [{ value: { $row: "name" } }], limit: 5, keep: null };
    const stored = automationStudioFlowDraftTranslateBindings(written).parameters;
    expect(automationStudioFlowDraftRenderBindings(stored)).toEqual(written);
  });

  it("leaves a state binding of another kind as it is", () => {
    const other = { $state: { path: "@s4.records" } };
    expect(automationStudioFlowDraftRenderBindings({ a: other })).toEqual({ a: other });
  });
});

// P5 (t270): an earlier step's output is stored under the step's own id, and
// shown back as the position that step holds in the draft now -- after a
// reorder, the new one -- so the model reads the form it writes.
describe("rendering an earlier step's output", () => {
  const at = (position: number, id: string): AutomationStudioFlowDraftStep => ({
    position, id, iteration: position, actionId: "node.list", input: {}, effect: "mutate", effectApplied: true, disposition: "kept"
  });
  const stored = { a: { $state: { path: "$step.d7.records" } }, b: [{ $state: { path: "$step.d7.first.label" } }] };

  it("shows the step's current position, its output and its field", () => {
    expect(automationStudioFlowDraftRenderBindings(stored, [at(1, "d3"), at(2, "d7")])).toEqual({ a: { $step: 2, output: "records" }, b: [{ $step: 2, output: "first", path: "label" }] });
    expect(automationStudioFlowDraftRenderBindings(stored, [at(1, "d7"), at(2, "d3")])).toEqual({ a: { $step: 1, output: "records" }, b: [{ $step: 1, output: "first", path: "label" }] });
  });

  it("shows a step that is no longer in the draft as no position", () => {
    expect(automationStudioFlowDraftRenderBindings(stored.a, [at(1, "d3")])).toEqual({ $step: null, output: "records" });
  });

  it("leaves it as stored when no draft is given to read positions from", () => {
    expect(automationStudioFlowDraftRenderBindings(stored)).toEqual(stored);
  });
});
