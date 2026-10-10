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
});
