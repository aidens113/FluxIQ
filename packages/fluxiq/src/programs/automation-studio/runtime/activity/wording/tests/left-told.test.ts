import { describe, expect, it } from "vitest";
import { automationStudioActivityLeftTold } from "../left-told.ts";

// What a build left on the site, as the person reads it (t567 lane 4). A failed
// build's chat listed every press in the ledger's words -- the same link four
// times, an overlay's close control as `click "–" div`, and "declared no
// lasting act, but had an effect: possibly lasting" after each.

const POSSIBLY = " (declared no lasting act, but had an effect: possibly lasting)";
const possibly = (did: string) => ({ did: `${did}${POSSIBLY}` });

describe("what a build left on the site, in a person's words", () => {
  it("says the screenshot's presses once each, in plain words, and that nothing is known to be left", () => {
    const told = automationStudioActivityLeftTold([], [
      possibly("click \"Reject non-essential\" button"),
      possibly("type text \"What\" input"),
      possibly("click \"No thanks\" link"),
      possibly("click \"–\" div"),
      possibly("click \"Platform Engineer\" link"),
      possibly("click \"Platform Engineer\" link"),
      possibly("click \"Platform Engineer\" link"),
      possibly("click \"Platform Engineer\" link")
    ]);
    expect(told).toBe("The build left no change on the site that it knows of. It also clicked “Reject non-essential”, “No thanks” and “Platform Engineer”, which changed the page and might have left something behind, so check them if you need the site exactly as it was.");
    for (const jargon of ["declared", "lasting", "possibly", " div", " link", "type text", "–", "target"]) expect(told).not.toContain(jargon);
  });

  it("says plainly that nothing is left when nothing is", () => {
    expect(automationStudioActivityLeftTold([], [])).toBe("The build left no change on the site that it knows of.");
    // Only text typed and a nameless control: nothing a person needs to check.
    expect(automationStudioActivityLeftTold([], [possibly("type text \"Search\" input"), possibly("click \"×\" button")])).toBe("The build left no change on the site that it knows of.");
  });

  it("names acts still in place, each once, with why one cannot be undone", () => {
    const told = automationStudioActivityLeftTold([
      { did: "press \"Save\" button" },
      { did: "press \"Save\" button" },
      { did: "press \"Send\" button", stays: "irreversible" },
      { did: "trial step 3 \"add it to the list\" on \"Add\"", stays: "kept" }
    ], [possibly("select \"Size\" combobox")]);
    expect(told).toBe("These changes the build made are still on the site: clicked “Save”, clicked “Send” (FluxIQ cannot undo this) and used “Add” (the site offers no way to undo it). It also chose “Size”, which changed the page and might have left something behind, so check it if you need the site exactly as it was.");
  });

  it("names the latest few presses and counts the rest", () => {
    const told = automationStudioActivityLeftTold([], Array.from({ length: 8 }, (_, index) => possibly(`click "Filter ${index + 1}" button`)));
    expect(told).not.toContain("“Filter 3”");
    expect(told).toContain("clicked “Filter 4”, “Filter 5”, “Filter 6”, “Filter 7”, “Filter 8” and 3 more,");
    expect(told).toContain("and 3 more");
  });
});
