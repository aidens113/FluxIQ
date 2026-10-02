// The control's words a draft step may carry: page text, so carried only as
// the permission gate carries a control's name -- shown to the model already,
// plain, and bounded (`../control-words.ts`).
import { describe, expect, it } from "vitest";
import { automationStudioFlowDraftControlWords } from "../control-words.ts";

const evidence = { ok: true, control: "Not now", page: "t1009 button \"Add to cart\"\nt1082 button \"Not now\"" };

describe("the words of the control a step acted on", () => {
  it("are carried when the call's own evidence showed them", () => {
    expect(automationStudioFlowDraftControlWords("Not now", evidence)).toBe("Not now");
    expect(automationStudioFlowDraftControlWords("Add to cart", evidence)).toBe("Add to cart");
  });

  it("are read with their whitespace collapsed, on both sides", () => {
    expect(automationStudioFlowDraftControlWords("  Add \n to   cart ", { page: "Add  to\tcart" })).toBe("Add to cart");
  });

  it("are withheld when the call's evidence never showed them", () => {
    expect(automationStudioFlowDraftControlWords("Place order", evidence)).toBeUndefined();
    expect(automationStudioFlowDraftControlWords("Not now", { ok: true })).toBeUndefined();
  });

  it("are withheld when they are not plain text", () => {
    expect(automationStudioFlowDraftControlWords("<b>Go</b>", { page: "<b>Go</b>" })).toBeUndefined();
    expect(automationStudioFlowDraftControlWords("Go\u0000", { page: "Go\u0000" })).toBeUndefined();
    expect(automationStudioFlowDraftControlWords("   ", { page: "   " })).toBeUndefined();
    expect(automationStudioFlowDraftControlWords(42, { page: "42" })).toBeUndefined();
    expect(automationStudioFlowDraftControlWords({ name: "Go" }, { page: "Go" })).toBeUndefined();
  });

  it("are cut to a bound, and found in full before they are cut", () => {
    const long = `Add ${"very ".repeat(60)}long name`;
    const carried = automationStudioFlowDraftControlWords(long, { page: long })!;
    expect(carried.length).toBeLessThanOrEqual(120);
    expect(carried.endsWith("...")).toBe(true);
    expect(long.startsWith(carried.slice(0, -3))).toBe(true);
    // Only the shown prefix of a long name is no proof the whole name was shown.
    expect(automationStudioFlowDraftControlWords(long, { page: long.slice(0, 130) })).toBeUndefined();
  });
});
