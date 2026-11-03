import { describe, expect, it } from "vitest";
import { automationStudioActivityPersonWords, automationStudioActivityReasonText } from "../index.ts";

// t791: a build's step reasons reached the chat carrying Core's own tool words ("a witnessed destination", "that reset
// ref"). A library catalogue stands in for the site.

const PLACE = "place where the change shows";

describe("Core's words for where a change shows, said as a person's", () => {
  it("says the place where the change shows", () => {
    expect(automationStudioActivityPersonWords("Read the holds page so the press has a witnessed destination, then send it with that reset ref.")).toBe(`Read the holds page so the press has a ${PLACE}, then send it with that ${PLACE}.`);
    expect(automationStudioActivityPersonWords("Name destination-1 for the saved searches; the witness stamp is missing.")).toBe(`Name the ${PLACE} for the saved searches; the ${PLACE} is missing.`);
    expect(automationStudioActivityPersonWords("Pass resetDestination for the saved searches list.")).toBe(`Pass the ${PLACE} for the saved searches list.`);
    expect(automationStudioActivityPersonWords("Witnessed destinations are listed.")).toBe("Places where the change shows are listed.");
    expect(automationStudioActivityPersonWords("an witnessed destination")).toBe(`a ${PLACE}`);
  });

  it("leaves ordinary words alone", () => {
    const plain = "Open the destination page and check the ref number in the footer.";
    expect(automationStudioActivityPersonWords(plain)).toBe(plain);
  });

  it("reaches the chat's step reason", () => {
    const shown = automationStudioActivityReasonText("Read the saved searches page completely so the hold press has a witnessed destination.");
    expect(shown).toBe(`Read the saved searches page completely so the hold press has a ${PLACE}.`);
    expect(shown).not.toMatch(/witness|reset ref|destination-/iu);
  });
});
