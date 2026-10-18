import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS } from "../index.ts";

// The words an undo aimed at another item's control is refused with (t475),
// as a candidate build and a reset brief are told them (t591, social debug
// fix 4): a reset has no test to run.

describe("site reset words for an undo aimed at another item", () => {
  it("does not promise a modern trial on leftovers or mistake source disappearance for restoration", () => {
    const words = WORDS.resetRequired(false);
    expect(words).toContain("Their disappearance alone does not prove");
    expect(words).toContain("remains listed and a later proved correction is still allowed");
    expect(words).not.toContain("the trial runs with that act already done");
  });
  it("reports a wrong target without promising a trial on unresolved identified effects", () => {
    expect(WORDS.wrongTarget()).toContain("any trial explicitly admitted");
    expect(WORDS.wrongTarget()).toContain("Identified reversible effects still require proved restoration");
    expect(WORDS.wrongTarget()).not.toContain("the next trial runs with it already done");
    expect(WORDS.undoRefused()).not.toContain("the next trial runs with it already done");
    expect(WORDS.alreadyUndone(true)).toContain("Positive original-state evidence");
  });

  it("tells a reset to undo another listed act or name the acts it cannot undo under cannotUndo, and never to test", () => {
    const said = WORDS.wrongTarget("reset");
    expect(said).toContain("Undo another listed act on its own item with \"undoes\"");
    expect(said).toContain("complete and name those acts under cannotUndo");
    expect(said).not.toMatch(/test|revision/iu);
  });
});
