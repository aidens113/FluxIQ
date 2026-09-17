import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_WITHHELD_LOCATOR,
  automationStudioLocatorShapedText,
  automationStudioWithoutLocators
} from "../locator-text.ts";

// Two halves of one guarantee. The screen names the shapes; the redaction can
// never emit something the screen would refuse. Everything else in this file is
// the other half of the bargain: what it must leave alone, because the
// sentences it edits are the best evidence in the request and redacting them
// into mush would be a different kind of failure.

describe("the locator screen", () => {
  it("names the ways this system has actually addressed an element", () => {
    for (const text of [
      'an element matching selector [data-testid="detach-target"]',
      'button[data-testid="dead-link"] "Link that goes nowhere"',
      "[aria-label=Save]",
      "[@id='save']",
      "[data-open]",
      'data-testid="save"',
      'id="confirm"',
      "//button",
      "//*",
      "/html/body/div",
      "/div[@id='x']",
      "text()",
      "li:nth-child(2)",
      "p::before",
      ".product-card",
      "#confirm",
      "button#confirm",
      ".row-selected"
    ]) {
      expect(automationStudioLocatorShapedText(text), text).toBe(true);
    }
  });

  it("leaves the vocabulary this system's own records are written in", () => {
    for (const text of [
      "nothing matched; 3 control(s) of the same family are on the page; best scored -0.29",
      'no exact match; 2 scored candidate(s) tied: button "Continue" (0.56), button "Continue" (0.56)',
      // This system's own identifiers, which have a class selector's shape and
      // are everywhere in a request. A rule wide enough to catch `div.row-x`
      // catches all of these, so there is none.
      "node.checkout",
      "web.output.dom-click",
      "automation-studio.recovery-context.v1",
      "automation-studio.runtime-diagnosis.v1+stage.gather",
      "web.target.selector_miss",
      "the server answered HTTP 404 for https://example.test/catalog/item/8821",
      "4.3 out of 5",
      "$189.00",
      "the run reached /checkout/confirm and stopped",
      "e.g. the Pay button",
      "Your organization manages these settings; they are read-only.",
      "This item was deleted. Nothing here replaces it.",
      "refused main scoring -0.29 with nothing the recording named agreeing exactly"
    ]) {
      expect(automationStudioLocatorShapedText(text), text).toBe(false);
      expect(automationStudioWithoutLocators(text)).toBe(text);
    }
  });

  it("keeps the sentence and withholds the locator inside it", () => {
    const redacted = automationStudioWithoutLocators(
      'an element matching selector [data-testid="detach-target"], visual target 379,116 (refused main scoring -0.29),'
      + ' element fingerprint (refused button[data-testid="dead-link"] "Link that goes nowhere" scoring -0.29)'
    );
    expect(redacted).not.toContain("detach-target");
    expect(redacted).not.toContain("dead-link");
    expect(redacted).toContain("visual target 379,116");
    expect(redacted).toContain("refused main scoring -0.29");
    expect(redacted).toContain('"Link that goes nowhere"');
    expect(redacted).toContain(AUTOMATION_STUDIO_WITHHELD_LOCATOR);
    expect(automationStudioLocatorShapedText(redacted)).toBe(false);
  });

  it("never returns a string the screen would refuse, and never returns the same object", () => {
    const stubborn = '#a .b [id=c] //d/e[@f="g"] li:nth-child(3) button#h';
    expect(automationStudioLocatorShapedText(automationStudioWithoutLocators(stubborn))).toBe(false);
    const value = { failure: { expected: 'selector [data-testid="x"]', scores: [-0.29] }, kept: "plain text" };
    const screened = automationStudioWithoutLocators(value);
    expect(screened).not.toBe(value);
    expect(screened.failure).not.toBe(value.failure);
    expect(screened.kept).toBe("plain text");
    expect(screened.failure.scores).toEqual([-0.29]);
    expect(screened.failure.expected).not.toContain("data-testid");
  });
});
