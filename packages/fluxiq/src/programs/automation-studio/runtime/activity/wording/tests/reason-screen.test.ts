// What of a model's stated reason the chat may show (t174-w116).
//
// Run `run-musq0b1m-0472cfa0` (deepseek-v4-pro, t174-w111): the chat showed
// "Clicking “×” — tool_call core.run_node" when the model gave no summary and
// Core wrote one from the decision (D15), and reasons in the draft's own
// mechanics -- act ids, "acts are done", "steps are in the draft", "repair the
// unreproducible steps ... then retest" -- under "Checking the Flow is
// finished" and "Updating the draft Flow" (D3).
import { describe, expect, it } from "vitest";
import { automationStudioActivityReasonText } from "../index.ts";

describe("a reason that is only codes (D15)", () => {
  it("shows nothing for a line made only of codes and ids, whatever screen", () => {
    expect(automationStudioActivityReasonText("tool_call core.run_node")).toBeUndefined();
    expect(automationStudioActivityReasonText("tool_call web.find_on_page")).toBeUndefined();
    expect(automationStudioActivityReasonText("amend_draft")).toBeUndefined();
    expect(automationStudioActivityReasonText("tool_call core.run_node", 240, { decision: true })).toBeUndefined();
  });

  it("keeps a person's words, a product name with digits included", () => {
    expect(automationStudioActivityReasonText("Enough.")).toBe("Enough.");
    expect(automationStudioActivityReasonText("Choose 7-in-1")).toBe("Choose 7-in-1");
    expect(automationStudioActivityReasonText("Close the popup.", 240, { decision: true })).toBe("Close the popup.");
  });
});

describe("a decision's reason in the draft's mechanics (D3)", () => {
  const shown = (text: string) => automationStudioActivityReasonText(text, 240, { decision: true });

  it("leaves out each sentence that names an act id or the draft's mechanics, and keeps the rest", () => {
    expect(shown("Select Space Grey, 7-in-1, Spain and quantity 3. That completes act a1.colour and a2.")).toBe("Select Space Grey, 7-in-1, Spain and quantity 3.");
    expect(shown("All acts are done and added to the Flow; completing with a one-sentence description of the result.")).toBeUndefined();
    expect(shown("Checking the Flow is finished: all requested acts are done and steps are in the draft.")).toBeUndefined();
    expect(shown("Repair the unreproducible steps by reordering them to match the actual page flow, then retest.")).toBeUndefined();
    expect(shown("Rerun step 7 with the correct 7-in-1 handle t985.")).toBeUndefined();
    expect(shown("I will reorder the quantity step to come after the colour. The cart needs three.")).toBe("I will reorder the quantity step to come after the colour. The cart needs three.");
  });

  it("does not screen a reason that is not a decision's", () => {
    // The result check's verdict (`result-verification/check-activity.ts`) is the judge's own reading.
    expect(automationStudioActivityReasonText("The draft's three steps put three hubs in the cart.")).toBe("The draft's three steps put three hubs in the cart.");
  });
});
