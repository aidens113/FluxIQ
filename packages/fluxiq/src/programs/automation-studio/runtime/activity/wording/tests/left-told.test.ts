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
    expect(told).toBe("These changes the build made are still on the site: clicked “Save” and clicked “Send” (FluxIQ cannot undo this). The build used “Add”, but could not undo it, so it may still be on the site; check it if you need the site exactly as it was. It also chose “Size”, which changed the page and might have left something behind, so check it if you need the site exactly as it was.");
  });

  // t741 B5, photo-social `run-mvgobp8h-b99ede98`: a trial act whose undo was refused (`undo_wrong_target`) was kept and
  // said "(the site offers no way to undo it)" as still on the site, though later reads showed the control back.
  it("says a reversible act the build could not undo may still be there, never that the site offers no way to undo it", () => {
    const told = automationStudioActivityLeftTold([{ did: "trial step 4 \"mark it\" on \"Mark\"", stays: "kept" }], []);
    expect(told).toBe("The build used “Mark”, but could not undo it, so it may still be on the site; check it if you need the site exactly as it was.");
    for (const claim of ["site offers no way", "still on the site:", "no change on the site"]) expect(told).not.toContain(claim);
    // A class no control takes back is still said as there, with why.
    const both = automationStudioActivityLeftTold([{ did: "press \"Pay\" button", stays: "irreversible" }, { did: "click span", stays: "kept" }, { did: "click span", stays: "kept" }], []);
    expect(both).toBe("These changes the build made are still on the site: clicked “Pay” (FluxIQ cannot undo this). The build made 2 presses it could not name, but could not undo them, so they may still be on the site; check them if you need the site exactly as it was.");
  });

  it("names the latest few presses and counts the rest", () => {
    const told = automationStudioActivityLeftTold([], Array.from({ length: 8 }, (_, index) => possibly(`click "Filter ${index + 1}" button`)));
    expect(told).not.toContain("“Filter 3”");
    expect(told).toContain("clicked “Filter 4”, “Filter 5”, “Filter 6”, “Filter 7”, “Filter 8” and 3 more,");
    expect(told).toContain("and 3 more");
  });

  // t738, job-board `run-mvgf4pk5-55343613`: three open presses on controls no word names were said as "one more change".
  it("counts acts no word names, so three nameless presses are said as three", () => {
    const told = automationStudioActivityLeftTold([{ did: "click span" }, { did: "click span" }, { did: "click span" }], []);
    expect(told).toBe("These changes the build made are still on the site: 3 presses it could not name.");
    expect(told).not.toContain("one more change");
    // Named and nameless together, and a nameless act that was no press.
    expect(automationStudioActivityLeftTold([{ did: "press \"Save recipe\" button" }, { did: "click \"–\" div" }, { did: "select listbox" }], []))
      .toBe("These changes the build made are still on the site: clicked “Save recipe”, 1 press it could not name and 1 act it could not name.");
  });

  it("never calls an act no change was seen of a change still on the site", () => {
    const told = automationStudioActivityLeftTold([{ did: "click span", seen: false }, { did: "click span", seen: false }, { did: "click span", seen: false }], []);
    expect(told).not.toContain("still on the site");
    expect(told).toBe("The build left no change on the site that it knows of. It made 3 presses it could not name, but no read ever showed a change from them, so they may have changed nothing; check them if you need the site exactly as it was.");
    const one = automationStudioActivityLeftTold([{ did: "press \"Add to reading list\" button" }, { did: "press \"Rate it\" button", seen: false }], []);
    expect(one).toBe("These changes the build made are still on the site: clicked “Add to reading list”. It clicked “Rate it”, but no read ever showed a change from it, so it may have changed nothing; check it if you need the site exactly as it was.");
  });
});
