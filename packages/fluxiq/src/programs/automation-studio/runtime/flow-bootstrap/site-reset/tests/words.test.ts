import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS } from "../index.ts";

// The words an undo aimed at another item's control is refused with (t475),
// as a candidate build and a reset brief are told them (t591, social debug
// fix 4): a reset has no test to run.

describe("site reset words for an undo aimed at another item", () => {
  it("keeps an unproved inverse refused and requires an explicit other act claim", () => {
    expect(WORDS.unprovedUndo(false)).toContain("created or changed");
    expect(WORDS.unprovedUndo(false)).not.toContain("Another recorded act");
    const words = WORDS.unprovedUndo(true);
    expect(words).toContain("Another recorded act");
    expect(words).toContain("explicitly name its id");
    expect(words).toContain("fresh complete original-state evidence");
    expect(words).toContain("was not run");
  });
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

// Rerun round 3 (office `run-mvgo5xft-25460ba2`): what a look under undoes
// settled, and a resetDestination named with no act, are said in generic words.
describe("site reset words for what a look settled", () => {
  it("says whether the named act settled, and points at the acts still open", () => {
    const settled = WORDS.lookSettled(true, true);
    expect(settled).toContain("settled the act it named under undoes");
    expect(settled).toContain("do not name it again");
    expect(settled).toContain("actsStillOpen");
    expect(WORDS.lookSettled(true, false)).toContain("No act of this build is still open");
    const open = WORDS.lookSettled(false, true);
    expect(open).toContain("has not settled the act it named under undoes");
    expect(open).toContain("settle");
  });

  it("says a resetDestination with no undoes settled nothing, and how to name both", () => {
    const words = WORDS.destinationWithoutUndoes(true);
    expect(words).toContain("settled nothing");
    expect(words).toContain("\"undoes\"");
    expect(words).toContain("example");
    expect(WORDS.destinationWithoutUndoes(false)).not.toContain("example");
    for (const said of [words, WORDS.lookSettled(true, true), WORDS.lookSettled(false, true)]) expect(said).not.toMatch(/\b(cart|basket|checkout|job|post|friend|order|product|address|save|heart|photo|like|feed)\b/iu);
  });
});
