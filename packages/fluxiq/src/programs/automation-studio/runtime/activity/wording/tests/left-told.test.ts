import { describe, expect, it } from "vitest";
import { automationStudioActivityLeftTold } from "../left-told.ts";

// What a build left on the site, as the person reads it (t567 lane 4). A failed
// build's chat listed every press in the ledger's words -- the same link four
// times, an overlay's close control as `click "–" div`, and "declared no
// lasting act, but had an effect: possibly lasting" after each.

const POSSIBLY = " (declared no lasting act, but had an effect: possibly lasting)";
const possibly = (did: string) => ({ did: `${did}${POSSIBLY}` });
const NOTHING = "The build left no change on the site that it knows of.";

describe("what a build left on the site, in a person's words", () => {
  it("says the screenshot's presses once each, in plain words, leaving out dismissals and moves to another page", () => {
    const told = automationStudioActivityLeftTold([], [
      possibly("click \"Reject non-essential\" button"),
      possibly("type text \"What\" input"),
      possibly("click \"No thanks\" link"),
      possibly("click \"–\" div"),
      possibly("click \"Add to shortlist\" button"),
      possibly("click \"Platform Engineer\" link"),
      possibly("click \"Add to shortlist\" button")
    ]);
    expect(told).toBe("The build clicked “Add to shortlist”, which changed the page and might have left something behind, so check it if you need the site exactly as it was.");
    for (const jargon of ["declared", "lasting", "possibly", " div", " link", "type text", "–", "target", "Reject", "No thanks", "Platform Engineer"]) expect(told).not.toContain(jargon);
  });

  it("says plainly that nothing is left when nothing is", () => {
    expect(automationStudioActivityLeftTold([], [])).toBe(NOTHING);
    // Only text typed, a nameless control and dismissals: nothing a person needs to check.
    expect(automationStudioActivityLeftTold([], [possibly("type text \"Search\" input"), possibly("click \"×\" button"), possibly("click \"Decline optional cookies\" button"),
      possibly("click \"Not now\" button"), possibly("click \"Close chat\" button")])).toBe(NOTHING);
  });

  it("names acts still in place, each once, with why one cannot be undone", () => {
    const told = automationStudioActivityLeftTold([
      { did: "press \"Save\" button" },
      { did: "press \"Save\" button" },
      { did: "press \"Send\" button", stays: "irreversible" },
      { did: "trial step 3 \"add it to the list\" on \"Add\"", stays: "kept" }
    ], [possibly("select \"Size\" combobox")]);
    expect(told).toBe("These changes the build made are still on the site: clicked “Save” and clicked “Send” (FluxIQ cannot undo this). The build ran the step “add it to the list”, but could not undo it, so it may still be on the site; check it if you need the site exactly as it was. It also chose “Size”, which changed the page and might have left something behind, so check it if you need the site exactly as it was.");
  });

  // t741 B5, photo-social `run-mvgobp8h-b99ede98`: a trial act whose undo was refused (`undo_wrong_target`) was kept and
  // said "(the site offers no way to undo it)" as still on the site, though later reads showed the control back.
  it("says a reversible act the build could not undo may still be there, never that the site offers no way to undo it", () => {
    const told = automationStudioActivityLeftTold([{ did: "trial step 4 \"mark it\" on \"Mark\"", stays: "kept" }], []);
    expect(told).toBe("The build ran the step “mark it”, but could not undo it, so it may still be on the site; check it if you need the site exactly as it was.");
    for (const claim of ["site offers no way", "still on the site:", "no change on the site", "used “"]) expect(told).not.toContain(claim);
    // A class no control takes back is still said as there, with why.
    const both = automationStudioActivityLeftTold([{ did: "press \"Pay\" button", stays: "irreversible" }, { did: "click span", stays: "kept" }, { did: "click span", stays: "kept" }], []);
    expect(both).toBe("These changes the build made are still on the site: clicked “Pay” (FluxIQ cannot undo this). The build pressed 2 controls with no label, but could not undo them, so they may still be on the site; check them if you need the site exactly as it was.");
  });

  it("names the latest few presses and counts the rest", () => {
    const told = automationStudioActivityLeftTold([], Array.from({ length: 8 }, (_, index) => possibly(`click "Filter ${index + 1}" button`)));
    expect(told).not.toContain("“Filter 3”");
    expect(told).toContain("clicked “Filter 4”, “Filter 5”, “Filter 6”, “Filter 7”, “Filter 8” and 3 more,");
  });

  // t738, job-board `run-mvgf4pk5-55343613`: three open presses on controls no word names were said as "one more change".
  it("counts acts no word names, so three nameless presses are said as three", () => {
    const told = automationStudioActivityLeftTold([{ did: "click span" }, { did: "click span" }, { did: "click span" }], []);
    expect(told).toBe("These changes the build made are still on the site: pressed 3 controls with no label.");
    expect(told).not.toContain("one more change");
    // Named and nameless together, and a nameless act that was no press.
    expect(automationStudioActivityLeftTold([{ did: "press \"Save recipe\" button" }, { did: "click \"–\" div" }, { did: "select listbox" }], []))
      .toBe("These changes the build made are still on the site: clicked “Save recipe”, pressed 1 control with no label and took 1 step without a label.");
  });

  // t753 round 5 (b): "The build left no change on the site that it knows of. It made 6 acts it could not name, but no
  // read ever showed a change from them": "no change" beside acts that may have left one, the same saves counted twice.
  it("never says no change beside acts that may have left one, and counts each act once", () => {
    const quiet = ["trial step 1 builtin.web.submit", "trial step 2 builtin.web.submit", "trial step 3 builtin.web.submit"];
    const told = automationStudioActivityLeftTold([...quiet, ...quiet].map((did) => ({ did, seen: false })), []);
    expect(told).toBe("The build took 3 steps without a label, and nothing read afterwards could show whether they changed anything; check them if you need the site exactly as it was.");
    for (const said of ["no change on the site", "could not name", "6 "]) expect(told).not.toContain(said);
    const one = automationStudioActivityLeftTold([{ did: "press \"Add to reading list\" button" }, { did: "press \"Rate it\" button", seen: false }], []);
    expect(one).toBe("These changes the build made are still on the site: clicked “Add to reading list”. It clicked “Rate it”, and nothing read afterwards could show whether it changed anything; check it if you need the site exactly as it was.");
    // A press that changed its page, alone, is said without "no change" before it.
    const pressed = automationStudioActivityLeftTold([], [possibly("click \"Apply coupon\" button")]);
    expect(pressed).toBe("The build clicked “Apply coupon”, which changed the page and might have left something behind, so check it if you need the site exactly as it was.");
  });
});

// t796: two holds left on books the task did not ask for were told as one "clicked Hold", without which books; a tab press
// and the opening of a book's page were listed as leaving something behind, burying the holds.
describe("what a build left, naming where", () => {
  it("names the place of each act left, so two holds on different books are two entries", () => {
    const told = automationStudioActivityLeftTold([
      { did: "click \"Hold\" button", on: "/library/book/12" },
      { did: "click \"Hold\" button", on: "/library/book/31" }
    ], []);
    expect(told).toBe("These changes the build made are still on the site: clicked “Hold” on the page “/library/book/12” and clicked “Hold” on the page “/library/book/31”.");
  });

  it("keeps an act with no known place as it was", () => {
    expect(automationStudioActivityLeftTold([{ did: "click \"Hold\" button" }], [])).toBe("These changes the build made are still on the site: clicked “Hold”.");
  });

  it("does not list a tab press or opening a page as something that might have been left behind", () => {
    const told = automationStudioActivityLeftTold([{ did: "click \"Hold\" button", on: "/library/book/12" }], [
      possibly("click \"Reviews\" tab"), possibly("click \"Authors\" tab"), possibly("trial step 4 \"open the book\" on \"Open\"")
    ]);
    expect(told).toBe("These changes the build made are still on the site: clicked “Hold” on the page “/library/book/12”.");
  });
});
