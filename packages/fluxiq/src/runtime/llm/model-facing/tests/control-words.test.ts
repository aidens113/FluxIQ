import { describe, expect, it } from "vitest";
import { runWithAutomationStudioDomainReadings } from "../../../domain-readings/index.ts";
import { automationStudioControlWordsOf, automationStudioModelFacingControlWords, automationStudioModelFacingControlWordsReadable } from "../control-words.ts";

// t431: a control is named to a model by its own words, as the domain reads them from the node's parameters, and never by how it was found.
// Core's half. A real domain's reading of its own parameters is tested in that domain.

const said = (words: readonly string[], parameters: Parameters<typeof automationStudioModelFacingControlWords>[0] = {}) =>
  runWithAutomationStudioDomainReadings({ controlWordsReader: () => ({ words, readsItsWords: false }) }, () => automationStudioModelFacingControlWords(parameters));

describe("automationStudioModelFacingControlWords", () => {
  it("names nothing with no domain's reading in scope, whatever the parameters hold", () => {
    expect(automationStudioModelFacingControlWordsReadable()).toBe(false);
    expect(automationStudioModelFacingControlWords({ element: { accessibleName: "Save", visibleText: "Save", label: "Save" }, target: { name: "Save" } })).toBeUndefined();
    expect(automationStudioControlWordsOf({ element: { accessibleName: "Save" } })).toBeUndefined();
  });

  it("names nothing when the domain's reading says the parameters carry no control", () => {
    expect(runWithAutomationStudioDomainReadings({ controlWordsReader: () => undefined }, () => [automationStudioModelFacingControlWordsReadable(), automationStudioModelFacingControlWords({})])).toEqual([true, undefined]);
  });

  it("takes the domain's words in its order, whitespace collapsed", () => {
    expect(said(["  Create\n post ", "Post"])).toBe("Create post");
    expect(said(["Email", "Other"])).toBe("Email");
    expect(said([])).toBeUndefined();
    expect(said(["   "])).toBeUndefined();
  });

  it("names nothing when the words only say how the control is found", () => {
    expect(said(["#composer", "matched by fingerprint 0.82"])).toBeUndefined();
  });

  it("skips a locator-shaped word for the next that is words", () => {
    expect(said(["[data-testid=composer]", "Write something..."])).toBe("Write something...");
  });

  // t748: a press's control vanished from trial feedback because its own words held "address", a word the failure-text
  // screen drops as finding talk. On a control those are page words; only a locator, a match score or the finding-only
  // words still make a control's words no words.
  it("names a control by its own words when they hold an ordinary page word the failure screen drops", () => {
    expect(said(["Send renewals to this address"])).toBe("Send renewals to this address");
    expect(said(["Show my reading score"])).toBe("Show my reading score");
    expect(said(["matched by fingerprint", "Selector: #renew"])).toBeUndefined();
    expect(said(["Renew 0.82"])).toBeUndefined();
  });
});
