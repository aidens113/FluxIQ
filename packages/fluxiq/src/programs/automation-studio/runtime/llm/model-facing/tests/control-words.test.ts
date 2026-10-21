import { describe, expect, it } from "vitest";
import { automationStudioModelFacingControlWords } from "../control-words.ts";

// t431: a control is named to a model by its own words, read from the node's parameters, and never by how it was found.

describe("automationStudioModelFacingControlWords", () => {
  it("reads the resolved element's words first, in preference order, whitespace collapsed", () => {
    expect(automationStudioModelFacingControlWords({ element: { visibleText: "Post", accessibleName: "  Create\n post " } })).toBe("Create post");
    expect(automationStudioModelFacingControlWords({ element: { label: "Email" }, target: { name: "Other" } })).toBe("Email");
  });

  it("falls back to the authored target, flat or as a fingerprint, by name or placeholder", () => {
    expect(automationStudioModelFacingControlWords({ target: { name: "Write something...", role: "button" } })).toBe("Write something...");
    expect(automationStudioModelFacingControlWords({ target: { kind: "element", fingerprint: { placeholder: "Search" } } })).toBe("Search");
    // A resolved identity's `name` is the form field's name attribute, a finding signal, never the control's words.
    expect(automationStudioModelFacingControlWords({ element: { name: "qty_input_3", tag: "input" } })).toBeUndefined();
    expect(automationStudioModelFacingControlWords({ target: { kind: "element", fingerprint: { name: "email" } } })).toBeUndefined();
  });

  it("names nothing when the control carries no words, or only words that say how it is found", () => {
    expect(automationStudioModelFacingControlWords(undefined)).toBeUndefined();
    expect(automationStudioModelFacingControlWords({ target: { role: "button" }, selector: "#go" })).toBeUndefined();
    expect(automationStudioModelFacingControlWords({ element: { accessibleName: "#composer", visibleText: "matched by fingerprint 0.82" } })).toBeUndefined();
  });

  it("skips a locator-shaped field for the next field that is words", () => {
    expect(automationStudioModelFacingControlWords({ element: { accessibleName: "[data-testid=composer]", visibleText: "Write something..." } })).toBe("Write something...");
  });

  // t748: a press's control vanished from trial feedback because its own words held "address", a word the failure-text
  // screen drops as finding talk. On a control those are page words; only a locator, a match score or the finding-only
  // words still make a control's words no words.
  it("names a control by its own words when they hold an ordinary page word the failure screen drops", () => {
    expect(automationStudioModelFacingControlWords({ element: { accessibleName: "Send renewals to this address" } })).toBe("Send renewals to this address");
    expect(automationStudioModelFacingControlWords({ element: { visibleText: "Show my reading score" } })).toBe("Show my reading score");
    expect(automationStudioModelFacingControlWords({ element: { accessibleName: "matched by fingerprint", visibleText: "Selector: #renew" } })).toBeUndefined();
    expect(automationStudioModelFacingControlWords({ element: { accessibleName: "Renew 0.82" } })).toBeUndefined();
  });
});
