import { describe, expect, it } from "vitest";
import { automationStudioModelFacingFailureText } from "../failure-text.ts";

// t426: a failure's own `expected` and `actual` reach the model only when nothing in them says how a control was found.

describe("automationStudioModelFacingFailureText", () => {
  it.each(["target_not_found", "target_ambiguous"])("carries no text at all for %s, however plain", (category) => {
    expect(automationStudioModelFacingFailureText({ category, expected: "the Continue control", actual: "nothing like it" })).toEqual({});
  });

  it("keeps another failure's texts when they are plain", () => {
    expect(automationStudioModelFacingFailureText({ category: "timeout", expected: "page text containing Seats (2)", actual: "the text did not appear before the timeout" }))
      .toEqual({ expected: "page text containing Seats (2)", actual: "the text did not appear before the timeout" });
  });

  it("keeps a price, a count and a dotted code, which are not scores or tokens", () => {
    const text = "the total reads $0.25 for 3 tickets (web.validation.failed)";
    expect(automationStudioModelFacingFailureText({ category: "expected_state_missing", expected: text })).toEqual({ expected: text });
  });

  it.each([
    ["an id token", "an element matching \"#booking-ref\" exists"],
    ["a class token", "no element matches \".spinner-overlay\""],
    ["an attribute locator", "an element matching [data-seat=\"F12\"]"],
    ["the word selector", "the action named no selector and no element"],
    ["the word fingerprint", "the element fingerprint did not match"],
    ["the word address", "the control's saved address is out of date"],
    ["a score", "the closest control matched at 0.27"],
    ["a negative score", "refused main (-0.29)"],
    ["the word scored", "best scored well below the bar"]
  ])("drops a text carrying %s, whole, and keeps the other", (_name, leaking) => {
    expect(automationStudioModelFacingFailureText({ category: "expected_state_missing", expected: leaking, actual: "the page showed the plan" })).toEqual({ actual: "the page showed the plan" });
    expect(automationStudioModelFacingFailureText({ category: "unexpected_state", expected: "the plan", actual: leaking })).toEqual({ expected: "the plan" });
  });
});
