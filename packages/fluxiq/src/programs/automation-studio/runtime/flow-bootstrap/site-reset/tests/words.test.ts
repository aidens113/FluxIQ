import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS } from "../index.ts";

// The words an undo aimed at another item's control is refused with (t475),
// as a candidate build and a reset brief are told them (t591, social debug
// fix 4): a reset has no test to run.

describe("site reset words for an undo aimed at another item", () => {
  it("tells a candidate build, byte for byte as before, to test the same revision again or undo another act", () => {
    expect(WORDS.wrongTarget()).toBe("That control is not shown to be on the item this act acted on, nor on anything it created, so it was not touched: an undo never acts on another item, or on one it cannot tell apart. "
      + "This act stays as it is and is listed under cannotUndo: the next trial runs with it already done, and the judge is told. "
      + "Do not try to undo it again. Test the same revision again now, or undo another listed act on its own item with \"undoes\".");
  });

  it("tells a reset to undo another listed act or name the acts it cannot undo under cannotUndo, and never to test", () => {
    const said = WORDS.wrongTarget("reset");
    expect(said).toContain("Undo another listed act on its own item with \"undoes\"");
    expect(said).toContain("complete and name those acts under cannotUndo");
    expect(said).not.toMatch(/test|revision/iu);
  });
});
