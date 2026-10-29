import { describe, expect, it } from "vitest";
import { automationStudioProjectBuildEndingTold, automationStudioProjectBuildReasonNothingChanged } from "../index.ts";

// t791 fix 5b: an ending that said nothing changed while the build's ledger held an act still in place. A forum
// follow and a library hold stand in for the lasting act.

const FOLLOW = { note: "Still on the target from this build: press \"Follow\" button.", told: "These changes the build made are still on the site: pressed \"Follow\" on the forum member's page." };
const HOLD = { note: "Still on the target from this build: press \"Place hold\" button.", told: "These changes the build made are still on the site: pressed \"Place hold\" on the book's page." };

describe("an ending that claimed nothing changed", () => {
  it("is corrected to name the act left on the site, for a blocked ending", () => {
    const told = automationStudioProjectBuildEndingTold({ reason: "I could not reach the member list. Nothing was changed on the account.", left: FOLLOW });
    expect(told.text).not.toMatch(/nothing was changed/iu);
    expect(told.text).toContain("I could not reach the member list.");
    expect(told.text.endsWith(FOLLOW.told)).toBe(true);
  });

  it("is corrected for a partial ending, in either wording of the claim", () => {
    const told = automationStudioProjectBuildEndingTold({ reason: "Only the first half worked. The site is unchanged and the build left no change behind.", left: HOLD });
    expect(told.text).toContain("Only the first half worked.");
    expect(told.text).not.toMatch(/unchanged|left no change/iu);
    expect(told.text).toContain("pressed \"Place hold\"");
  });

  it("is kept as it was where the build left nothing, and a claim about the Flow stays", () => {
    const reason = "The list never loaded. Nothing was changed on the account.";
    expect(automationStudioProjectBuildEndingTold({ reason, left: { note: undefined } }).why).toBe(reason);
    expect(automationStudioProjectBuildReasonNothingChanged("Nothing was put into the Flow. I kept a draft.")).toBe("Nothing was put into the Flow. I kept a draft.");
  });
});
