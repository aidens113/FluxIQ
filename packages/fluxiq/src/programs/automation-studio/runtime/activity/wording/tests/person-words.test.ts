import { describe, expect, it } from "vitest";
import { automationStudioActivityPersonWords, automationStudioActivityReasonText } from "../index.ts";

// R4a (`run-mv2nlh9l-52e476da`, moments 05 and 07): the model's own words
// reached the chat as "The quantity field handle failed in the trial; I will
// re-read the item page to find the current quantity input handle before
// resubmitting" and "I drop that optional step and resubmit the Flow".
describe("automationStudioActivityPersonWords: handles and resubmitting", () => {
  it("says a control's handle as the control", () => {
    expect(automationStudioActivityPersonWords("The quantity field handle failed in the trial")).toBe("The quantity field failed in the trial");
    expect(automationStudioActivityPersonWords("find the current quantity input handle")).toBe("find the current quantity input");
    expect(automationStudioActivityPersonWords("the button handles were stale")).toBe("the buttons were stale");
  });

  it("says a handle named by which one as the control, and leaves the verb alone", () => {
    expect(automationStudioActivityPersonWords("I need a fresh handle for it")).toBe("I need a fresh control for it");
    expect(automationStudioActivityPersonWords("The handle changed")).toBe("The control changed");
    expect(automationStudioActivityPersonWords("its handle id moved")).toBe("its control moved");
    expect(automationStudioActivityPersonWords("I will handle the popup first")).toBe("I will handle the popup first");
  });

  it("says resubmitting as sending again, with what it sends", () => {
    expect(automationStudioActivityPersonWords("I drop that optional step and resubmit the Flow")).toBe("I drop that optional step and send the Flow again");
    expect(automationStudioActivityPersonWords("before resubmitting")).toBe("before sending it again");
    expect(automationStudioActivityPersonWords("Resubmit it with the fix")).toBe("Send it again with the fix");
    expect(automationStudioActivityPersonWords("I resubmitted the candidate")).toBe("I sent the Flow again");
    expect(automationStudioActivityPersonWords("The resubmission was refused")).toBe("The Flow sent again was refused");
  });

  it("holds the model's whole reason from R4a to plain words", () => {
    const said = automationStudioActivityReasonText("The quantity field handle failed in the trial; I will re-read the item page to find the current quantity input handle before resubmitting.");
    expect(said).toBe("The quantity field failed in the trial; I will re-read the item page to find the current quantity input before sending it again.");
    expect(said).not.toMatch(/handle|resubmit/iu);
  });
});
