// The domain's words for a step's call, as the draft keeps them (`../step-words.ts`).
// Live run `run-muqiojz4-04a7a8fc` needed them to tell a "×" from an
// add-to-cart press; a describer with nothing to say leaves the step as it was.
import { describe, expect, it, vi } from "vitest";
import { automationStudioFlowDraftStepWordsOf } from "../step-words.ts";

const call = { toolId: "core.run_node", value: { node: "web.output.dom-click", parameters: { target: { handle: "t1091" } } } };

describe("the domain's words for a step's call", () => {
  it("keeps a target and a text, as strings, and passes the call through unchanged", () => {
    const describe = vi.fn(() => ({ target: "×" }));
    expect(automationStudioFlowDraftStepWordsOf(describe, call)).toEqual({ target: "×" });
    expect(describe).toHaveBeenCalledWith(call);
    expect(automationStudioFlowDraftStepWordsOf(() => ({ target: "Search", text: "paper towels" }), call)).toEqual({ target: "Search", text: "paper towels" });
    expect(automationStudioFlowDraftStepWordsOf(() => ({ text: "Escape" }), call)).toEqual({ text: "Escape" });
  });

  it("is nothing for an absent describer, no answer, or an answer of another shape", () => {
    expect(automationStudioFlowDraftStepWordsOf(undefined, call)).toBeUndefined();
    expect(automationStudioFlowDraftStepWordsOf(() => undefined, call)).toBeUndefined();
    expect(automationStudioFlowDraftStepWordsOf(() => "×", call)).toBeUndefined();
    expect(automationStudioFlowDraftStepWordsOf(() => ["×"], call)).toBeUndefined();
    expect(automationStudioFlowDraftStepWordsOf(() => ({ target: 7, text: "   " }), call)).toBeUndefined();
  });

  it("does not read a describer's fault as no words: its error goes on to the caller", () => {
    expect(() => automationStudioFlowDraftStepWordsOf(() => { throw new Error("no page for that handle"); }, call)).toThrow("no page for that handle");
  });

  it("keeps only the known fields, folds whitespace, and bounds a control's words to a name", () => {
    expect(automationStudioFlowDraftStepWordsOf(() => ({ target: "  Add\n to\tcart ", page: "<html>" }), call)).toEqual({ target: "Add to cart" });
    const long = automationStudioFlowDraftStepWordsOf(() => ({ target: "word ".repeat(100) }), call);
    expect(long?.target?.length).toBeLessThanOrEqual(160);
    expect(long?.target?.endsWith("...")).toBe(true);
  });
});
