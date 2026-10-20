import { describe, expect, it } from "vitest";
import { automationStudioActivityActsSaid } from "../act-words.ts";

// t738: acts of the build in a person's words. Three presses on nameless controls were each said as "one more
// change" and then kept once; a reset named acts by their ledger ids.

describe("acts of the build in a person's words", () => {
  it("reads each act by verb and name, a nameless control's act as a press it could not name", () => {
    expect(automationStudioActivityActsSaid([{ did: "click span" }])).toEqual([{ words: "1 press it could not name", counted: true, verb: "clicked", name: undefined, passing: false }]);
    expect(automationStudioActivityActsSaid([{ did: "press \"Save recipe\" button" }])).toEqual([{ words: "clicked “Save recipe”", counted: false, verb: "clicked", name: "“Save recipe”", passing: false }]);
    expect(automationStudioActivityActsSaid([{ did: "trial step 2 \"rate it\" on \"Five stars\"" }])[0]).toMatchObject({ words: "used “Five stars”" });
    expect(automationStudioActivityActsSaid([{ did: "type text \"Title\" input" }])[0]).toMatchObject({ passing: true });
  });

  it("says each named act once and counts the nameless ones, keeping acts with different notes apart", () => {
    const said = automationStudioActivityActsSaid([
      { did: "click span" }, { did: "click span" }, { did: "click span" },
      { did: "press \"Save recipe\" button" }, { did: "press \"Save recipe\" button" },
      { did: "click div", note: "(FluxIQ cannot undo it)" }
    ]);
    expect(said.map((act) => act.words)).toEqual(["clicked “Save recipe”", "3 presses it could not name", "1 press it could not name (FluxIQ cannot undo it)"]);
  });
});
