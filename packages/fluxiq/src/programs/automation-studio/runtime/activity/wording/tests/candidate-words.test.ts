// A candidate build's acts as the chat names them (t362, lane A round 4,
// `run-muyrpbnk-fef374e7`, UI review): the cards read "Using “Submit
// candidate”" and "Using “Test candidate”", and the model's own line beside
// them "Testing the submitted Flow revision 2 ...". A person reads what the
// act does for their Flow, with no revision number and no tool name.
import { describe, expect, it } from "vitest";
import { automationStudioActivityReasonText, automationStudioActivityToolCall } from "../index.ts";

const TOOL_NAMES = /submit[_ ]candidate|test[_ ]candidate|core\.|revision|\bcandidate\b/iu;

describe("a candidate build's tools in the chat", () => {
  it("saving and testing the Flow are named as the acts they are, whatever the call carries", () => {
    const submit = automationStudioActivityToolCall({ callId: "submit-3", toolId: "core.submit_candidate", value: { flow: "open https://shop.example\nclick t12", summary: "whole flow" } });
    const test = automationStudioActivityToolCall({ callId: "test-1", toolId: "core.test_candidate", value: { revision: 7, digest: "a".repeat(64) } });
    expect([submit.title, submit.label]).toEqual(["Saving the Flow's steps", "Saving the Flow's steps"]);
    expect([test.title, test.label]).toEqual(["Testing the whole Flow from the start", "Testing the whole Flow from the start"]);
    for (const said of [submit.title, submit.label, test.title, test.label]) {
      expect(said).not.toMatch(TOOL_NAMES);
      expect(said).not.toMatch(/^Using /u);
      expect(said).not.toMatch(/\d/u);
    }
  });

  it("the model's line beside them names no revision and calls the candidate the Flow", () => {
    const reasons = [
      "Testing the submitted Flow revision 2 to verify it collects the coupon and adds three to the cart.",
      "Revision 7 fixes the coupon step; submitting the candidate again.",
      "Submitting candidate (revision 3) with the popup steps removed.",
      "The candidate's coupon step failed in rev 4, so I'll check the item page again."
    ].map((text) => automationStudioActivityReasonText(text, 240, { decision: true }));
    expect(reasons).toEqual([
      "Testing the submitted Flow to verify it collects the coupon and adds three to the cart.",
      "This version fixes the coupon step; submitting the Flow again.",
      "Submitting the Flow with the popup steps removed.",
      "The Flow's coupon step failed in this version, so I'll check the item page again."
    ]);
    for (const said of reasons) expect(said ?? "").not.toMatch(TOOL_NAMES);
  });
});
