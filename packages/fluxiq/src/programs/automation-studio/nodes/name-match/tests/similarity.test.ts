import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_NAME_MATCH_SCORE_FLOOR,
  automationStudioNameEditDistance,
  automationStudioNameSimilarity,
  automationStudioNameTokenOverlap,
  normalizeAutomationStudioName
} from "../index.ts";

describe("normalizeAutomationStudioName", () => {
  it("collapses every separator, case and camel-case hump to one form", () => {
    for (const written of [
      "web.output.dom-extract_list",
      "web.output.dom-extract-list",
      "web/output/dom/extract/list",
      "WEB.OUTPUT.DOM_EXTRACT_LIST",
      "web.output.domExtractList",
      "  web output   dom extract list  "
    ]) {
      expect(normalizeAutomationStudioName(written), written).toBe("web output dom extract list");
    }
  });

  it("splits an acronym from the word that follows it", () => {
    expect(normalizeAutomationStudioName("DOMClick")).toBe("dom click");
    expect(normalizeAutomationStudioName("parseHTMLTable")).toBe("parse html table");
  });

  it("answers an empty string for a name that is only separators", () => {
    expect(normalizeAutomationStudioName("")).toBe("");
    expect(normalizeAutomationStudioName("  ._-/ ")).toBe("");
  });
});

describe("automationStudioNameEditDistance", () => {
  it("counts single-character edits", () => {
    expect(automationStudioNameEditDistance("list", "list")).toBe(0);
    expect(automationStudioNameEditDistance("list", "lst")).toBe(1);
    expect(automationStudioNameEditDistance("list", "lists")).toBe(1);
    expect(automationStudioNameEditDistance("extract", "exctart")).toBe(3);
    expect(automationStudioNameEditDistance("", "list")).toBe(4);
    expect(automationStudioNameEditDistance("list", "")).toBe(4);
  });
});

describe("automationStudioNameTokenOverlap", () => {
  it("reports containment separately from dice, so a short name is not punished", () => {
    expect(automationStudioNameTokenOverlap("dom extract list", "web output dom extract list")).toEqual({
      dice: 0.75,
      containment: 1
    });
    expect(automationStudioNameTokenOverlap("send email", "web output dom click")).toEqual({ dice: 0, containment: 0 });
    expect(automationStudioNameTokenOverlap("", "web output dom click")).toEqual({ dice: 0, containment: 0 });
  });
});

describe("automationStudioNameSimilarity", () => {
  it("scores identical normalised names 1 and an empty name 0", () => {
    expect(automationStudioNameSimilarity("web output dom click", "web output dom click")).toBe(1);
    expect(automationStudioNameSimilarity("", "web output dom click")).toBe(0);
  });

  it("separates names that should resolve from names that should not, around the floor", () => {
    const resolvable = automationStudioNameSimilarity("dom extract list", "web output dom extract list");
    const absent = automationStudioNameSimilarity("send email", "web output dom extract list");
    expect(resolvable).toBeGreaterThan(AUTOMATION_STUDIO_NAME_MATCH_SCORE_FLOOR);
    expect(absent).toBeLessThan(AUTOMATION_STUDIO_NAME_MATCH_SCORE_FLOOR);
    expect(resolvable).toBeGreaterThan(absent * 5);
  });
});
