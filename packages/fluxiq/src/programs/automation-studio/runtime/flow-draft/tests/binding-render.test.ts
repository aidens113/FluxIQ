// A stored binding is shown back to the model in the form it wrote it, so the
// draft reads in one vocabulary and `$state` never reaches a request.
import { describe, expect, it } from "vitest";
import { automationStudioFlowDraftTranslateBindings } from "../binding-forms.ts";
import { automationStudioFlowDraftRenderBindings } from "../binding-render.ts";

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
