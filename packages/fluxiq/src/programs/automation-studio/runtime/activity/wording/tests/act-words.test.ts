import { describe, expect, it } from "vitest";
import { automationStudioActivityActsSaid } from "../act-words.ts";

// t738: acts of the build in a person's words. Three presses on nameless controls were each said as "one more
// change" and then kept once; a reset named acts by their ledger ids.

describe("acts of the build in a person's words", () => {
  it("reads each act by verb and name, a nameless control's act as a press on a control with no label", () => {
    expect(automationStudioActivityActsSaid([{ did: "click span" }])).toEqual([{ words: "pressed 1 control with no label", counted: true, count: 1, verb: "clicked", name: undefined, passing: false }]);
    expect(automationStudioActivityActsSaid([{ did: "press \"Save recipe\" button" }])).toEqual([{ words: "clicked “Save recipe”", counted: false, count: 1, verb: "clicked", name: "“Save recipe”", passing: false }]);
    expect(automationStudioActivityActsSaid([{ did: "type text \"Title\" input" }])[0]).toMatchObject({ passing: true });
  });

  it("says each named act once and counts the nameless ones, keeping acts with different notes apart", () => {
    const said = automationStudioActivityActsSaid([
      { did: "click span" }, { did: "click span" }, { did: "click span" },
      { did: "press \"Save recipe\" button" }, { did: "press \"Save recipe\" button" },
      { did: "click div", note: "(FluxIQ cannot undo it)" }
    ]);
    expect(said.map((act) => act.words)).toEqual(["clicked “Save recipe”", "pressed 3 controls with no label", "pressed 1 control with no label (FluxIQ cannot undo it)"]);
    for (const act of said) expect(act.words).not.toContain("could not name");
  });

  // t753 round 5 (c): "The build used “Unlike”, but could not undo it" named the control a trial step's press left
  // showing, the reverse of what stayed on the site. A trial step is named by its own label, what it did.
  it("names a trial step by what it did, never by the control it left showing", () => {
    expect(automationStudioActivityActsSaid([{ did: "trial step 2 \"rate it\" on \"Five stars\"" }])[0]).toMatchObject({ words: "ran the step “rate it”", counted: false });
    expect(automationStudioActivityActsSaid([{ did: "trial step 3 \"pin the photo\" on \"Unpin\"" }])[0]!.words).not.toContain("Unpin");
    // A step that ran in loop passes (t748) is still a trial step, and named.
    expect(automationStudioActivityActsSaid([{ did: "trial step 6, pass 3 of 3 \"save the note\" on \"Saved\"" }])[0]).toMatchObject({ words: "ran the step “save the note”", counted: false });
    // A step with no label is said by the control it ran on, never as "used".
    const bare = automationStudioActivityActsSaid([{ did: "trial step 4 builtin.web.click on \"Pin\"" }])[0]!;
    expect(bare).toMatchObject({ words: "ran a step on “Pin”", counted: false });
    expect(bare.words).not.toMatch(/^used /u);
  });

  // t753 round 5 (b): "It made 6 acts it could not name" counted three saves twice, once for each whole test run that
  // made them. The same step of the Flow is one act, whichever test ran it.
  it("counts the same trial step once, however many test runs made it", () => {
    const said = automationStudioActivityActsSaid([
      { did: "trial step 1 builtin.web.submit" }, { did: "trial step 2 builtin.web.submit" }, { did: "trial step 3 builtin.web.submit" },
      { did: "trial step 1 builtin.web.submit" }, { did: "trial step 2 builtin.web.submit" }, { did: "trial step 3 builtin.web.submit" }
    ]);
    expect(said).toEqual([{ words: "took 3 steps without a label", counted: true, count: 3, verb: "used", name: undefined, passing: false }]);
  });

  // t753 round 5 (a): "It also clicked “Decline optional cookies”, “Not now” and “Close chat”, which changed the page
  // and might have left something behind". A dismissal, a close or a move to another page saves nothing by itself.
  it("treats dismissals, closes and moves to another page as saving nothing by themselves", () => {
    for (const did of ["click \"Decline optional cookies\" button", "click \"Not now\" button", "click \"Close chat\" button", "click \"Reject non-essential\" button",
      "click \"No thanks\" button", "click \"Dismiss\" button", "click \"Platform news\" link", "click \"Next page\" button"]) {
      expect(automationStudioActivityActsSaid([{ did }])[0], did).toMatchObject({ passing: true });
    }
    for (const did of ["click \"Decline\" button", "click \"Save\" button", "click \"Accept\" button", "select \"Size\" combobox"]) {
      expect(automationStudioActivityActsSaid([{ did }])[0], did).toMatchObject({ passing: false });
    }
  });

  // t774 round 6: "It also clicked ... ran the step 'show more of the feed', which changed the page and might have left
  // something behind" listed a scroll for the next page beside "Nothing was changed on your account".
  it("treats a trial step labelled for moving around or reading the page as saving nothing by itself", () => {
    for (const label of ["show more of the feed", "go to the reels page", "find the newest posts", "scroll to the end"]) {
      expect(automationStudioActivityActsSaid([{ did: `trial step 4 "${label}" on "Feed"` }])[0], label).toMatchObject({ verb: "ran the step", passing: true });
    }
    for (const label of ["like the post", "save the job", "add it to the cart"]) {
      expect(automationStudioActivityActsSaid([{ did: `trial step 4 "${label}" on "Feed"` }])[0], label).toMatchObject({ passing: false });
    }
  });
});
