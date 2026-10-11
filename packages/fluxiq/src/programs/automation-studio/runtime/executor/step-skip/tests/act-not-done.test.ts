// Whether a step passed over does a lasting act (r4b F4), read off the node
// alone, on a generic lending-library site.
import { describe, expect, it } from "vitest";
import { automationStudioSkippedStepDoesAct } from "../index.ts";

const node = (words?: string, label?: string) => ({ ...(label ? { label } : {}), ...(words ? { parameterValues: { element: { visibleText: words } } } : {}) });

describe("a skipped step's lasting act", () => {
  it.each(["Claim voucher", "Reserve", "Add to basket", "Save to my list", "Submit request"])("is read from the saved control's words: %s", (words) => {
    expect(automationStudioSkippedStepDoesAct(node(words))).toBe(true);
  });

  it("is read from the label when the control was saved with no words", () => {
    expect(automationStudioSkippedStepDoesAct(node(undefined, "Claim the welcome voucher"))).toBe(true);
  });

  it.each(["Close", "No thanks", "Not now", "×", "Close the voucher offer", "Save cookie preferences", "Help", "Search"])("is none for a dismissal or a look: %s", (words) => {
    expect(automationStudioSkippedStepDoesAct(node(words))).toBe(false);
  });

  it("reads the control before the label, and nothing from no words", () => {
    expect(automationStudioSkippedStepDoesAct(node("Not now", "Claim the welcome voucher"))).toBe(false);
    expect(automationStudioSkippedStepDoesAct({})).toBe(false);
  });
});
