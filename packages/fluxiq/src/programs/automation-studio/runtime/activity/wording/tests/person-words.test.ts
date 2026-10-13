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

// C1 and C2 of round 15 (`run-mv6eq0m8-3fe9dc47`): the chat read "Testing the
// whole Flow from the start - Testing, which keeps earbuds sold with a charging
// case ..." for the model's "Testing revision 3, which keeps ...", and "... and
// test the new revision" beside it. A numbered revision that is a verb's object
// is the version being tested, and an unnumbered one is a version.
describe("automationStudioActivityPersonWords: a revision the sentence needs", () => {
  it("says a numbered revision after a verb as this version", () => {
    expect(automationStudioActivityPersonWords("Testing revision 3, which keeps earbuds sold with a charging case while excluding ear tips.")).toBe("Testing this version, which keeps earbuds sold with a charging case while excluding ear tips.");
    expect(automationStudioActivityPersonWords("I will test rev 4 next")).toBe("I will test this version next");
    expect(automationStudioActivityPersonWords("Submitted revisions 2 and 3 without testing")).toBe("Submitted this version without testing");
  });

  it("says it as the version after a word that already says which", () => {
    expect(automationStudioActivityPersonWords("Testing the latest revision 4 now")).toBe("Testing the latest version now");
    expect(automationStudioActivityPersonWords("the Flow's revision 2 adds a wait")).toBe("the Flow's version adds a wait");
  });

  it("still leaves it out after the noun it numbers, and says it as this version after a preposition or as the subject", () => {
    expect(automationStudioActivityPersonWords("Testing the submitted Flow revision 2 to verify it")).toBe("Testing the submitted Flow to verify it");
    expect(automationStudioActivityPersonWords("The coupon step failed in rev 4.")).toBe("The coupon step failed in this version.");
    expect(automationStudioActivityPersonWords("Revision 7 fixes the coupon step")).toBe("This version fixes the coupon step");
  });

  it("says an unnumbered revision as a version", () => {
    expect(automationStudioActivityPersonWords("send the Flow again, and test the new revision.")).toBe("send the Flow again, and test the new version.");
    expect(automationStudioActivityPersonWords("Revisions so far kept the accessories")).toBe("Versions so far kept the accessories");
  });

  it("never leaves a sentence whose verb has lost its object", () => {
    for (const text of ["Testing revision 3, which keeps the earbuds.", "Checking rev 2 against the request.", "Running revision 5 from the start."]) {
      const said = automationStudioActivityPersonWords(text);
      expect(said).not.toMatch(/^\w+ing[,.]/u);
      expect(said).not.toMatch(/revision|\brev\b|\d/iu);
    }
  });
});
