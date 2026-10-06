// A step in the Flow keeps the steps that got its page there (`../opener.ts`).
// Lane A's run 40 (t174) pressed the store chip without adding it, added "Set
// as my store" from inside the chooser it opened, and the Flow failed on that
// button with the chooser closed. Run muqk4u32 (t174 F41) added a variant on
// the item page five page-changing steps after the last kept one, and the rule
// stopped two steps back: the search and the listing were never kept.
import { describe, expect, it } from "vitest";
import { applyAutomationStudioFlowDraftAmendments } from "../amendment/index.ts";
import { automationStudioFlowDraftKeepOpeners } from "../opener.ts";
import type { AutomationStudioFlowDraftStep } from "../step.ts";

type Spec = { from: string; to: string; disposition?: AutomationStudioFlowDraftStep["disposition"]; look?: true; failed?: true };
const draft = (specs: Spec[]): AutomationStudioFlowDraftStep[] => specs.map((spec, index) => ({
  position: index + 1, iteration: index + 1, actionId: spec.look ? "look" : "press", input: { step: index + 1 },
  effect: spec.look ? "observe" as const : "mutate" as const, effectApplied: !spec.look && !spec.failed, stateBefore: spec.from, stateAfter: spec.to,
  disposition: spec.disposition ?? "taken"
}));
const inFlow = (steps: AutomationStudioFlowDraftStep[]) => steps.filter((step) => step.disposition === "kept").map((step) => step.position);
const positions = (steps: AutomationStudioFlowDraftStep[]) => steps.map((step) => step.position);

describe("a step added to the Flow", () => {
  it("run 40: brings the chip press that opened the chooser it is inside", () => {
    // Start, Reject all, the store chip (taken), a look inside the chooser, "Set as my store".
    const steps = draft([
      { from: "s0", to: "s1", disposition: "kept" }, { from: "s1", to: "s2", disposition: "kept" },
      { from: "s2", to: "s3" }, { from: "s3", to: "s3", look: true }, { from: "s3", to: "s4" }
    ]);
    applyAutomationStudioFlowDraftAmendments(steps, [{ step: 5, change: "add" }]);
    expect(inFlow(steps)).toEqual([1, 2, 3, 5]);
  });

  it("brings each press of a chain: the drawer, then the menu inside it", () => {
    const steps = draft([{ from: "s0", to: "s1", disposition: "kept" }, { from: "s1", to: "s2" }, { from: "s2", to: "s3" }, { from: "s3", to: "s4" }]);
    expect(positions(automationStudioFlowDraftKeepOpeners(steps, steps[3]!))).toEqual([3, 2]);
    expect(steps.map((step) => step.disposition)).toEqual(["kept", "kept", "kept", "taken"]);
  });

  it("run 40: brings the product link though the product page went on loading before the size was chosen", () => {
    // The search results, the product link (taken), the size on a product page whose digest grew after the press answered.
    const steps = draft([{ from: "s0", to: "s1", disposition: "kept" }, { from: "s1", to: "s2" }, { from: "s2", to: "s3" }, { from: "s3b", to: "s4" }]);
    expect(positions(automationStudioFlowDraftKeepOpeners(steps, steps[3]!))).toEqual([3, 2]);
  });

  it("run muqk4u32: adding 7-in-1 brings every step back to the arrival -- the ×, the search, the listing, the consent and Space Grey", () => {
    // 1 the arrival (kept), 2 a press refused by the popup over it, 3 the
    // popup's ×, 4 the search typed and submitted, 5 the listing opened in a
    // new tab, 6 "Reject non-essential", 7 Space Grey, 8 7-in-1 added as it ran.
    // The old rule kept 7 and 6 and stopped: dry runs 1 and 2 ran 6 on the home page.
    const steps = draft([
      { from: "blank", to: "home+popup", disposition: "kept" }, { from: "home+popup", to: "home+popup", failed: true },
      { from: "home+popup", to: "home" }, { from: "home", to: "results" }, { from: "results", to: "item+consent" },
      { from: "item+consent", to: "item" }, { from: "item", to: "item-grey" }, { from: "item-grey", to: "item-grey-7in1" }
    ]);
    steps[7]!.disposition = "kept";
    expect(positions(automationStudioFlowDraftKeepOpeners(steps, steps[7]!))).toEqual([7, 6, 5, 4, 3]);
    expect(inFlow(steps)).toEqual([1, 3, 4, 5, 6, 7, 8]);
  });

  it("brings the whole taken chain when nothing before it is in the Flow, however long", () => {
    const steps = draft([{ from: "s0", to: "s1" }, { from: "s1", to: "s2" }, { from: "s2", to: "s3" }, { from: "s3", to: "s4" }, { from: "s4", to: "s5" }]);
    expect(positions(automationStudioFlowDraftKeepOpeners(steps, steps[4]!))).toEqual([4, 3, 2, 1]);
  });

  it("stops at the last step in the Flow, and never brings what came before it", () => {
    const steps = draft([{ from: "s0", to: "s1" }, { from: "s1", to: "s2", disposition: "kept" }, { from: "s2", to: "s3" }, { from: "s3", to: "s4" }]);
    expect(positions(automationStudioFlowDraftKeepOpeners(steps, steps[3]!))).toEqual([3]);
    expect(inFlow(steps)).toEqual([2, 3]);
  });

  it("leaves out a detour: the wrong listing opened and left again", () => {
    // Home (kept), the search, listing A, back to the results, listing B, a press on B.
    const steps = draft([
      { from: "s0", to: "home", disposition: "kept" }, { from: "home", to: "results" }, { from: "results", to: "itemA" },
      { from: "itemA", to: "results" }, { from: "results", to: "itemB" }, { from: "itemB", to: "itemB2" }
    ]);
    applyAutomationStudioFlowDraftAmendments(steps, [{ step: 6, change: "add" }]);
    expect(inFlow(steps)).toEqual([1, 2, 5, 6]);
  });

  it("leaves out a stretch that came back to where the last kept step left the page", () => {
    // A drawer opened and closed again after the kept step, then the press that matters.
    const steps = draft([{ from: "s0", to: "s1", disposition: "kept" }, { from: "s1", to: "drawer" }, { from: "drawer", to: "s1" }, { from: "s1", to: "s2" }, { from: "s2", to: "s3" }]);
    expect(positions(automationStudioFlowDraftKeepOpeners(steps, steps[4]!))).toEqual([4]);
  });

  it("walks past a press that did not work, though the page went on loading under it", () => {
    const steps = draft([{ from: "s0", to: "s1", disposition: "kept" }, { from: "s1", to: "s2" }, { from: "s2", to: "s2b", failed: true }, { from: "s2b", to: "s3" }]);
    expect(positions(automationStudioFlowDraftKeepOpeners(steps, steps[3]!))).toEqual([2]);
  });

  it("brings nothing when the page is back where the press started, when the press was dropped, or when the states were not seen", () => {
    const moved = draft([{ from: "s1", to: "s2" }, { from: "s1", to: "s3" }]);
    expect(automationStudioFlowDraftKeepOpeners(moved, moved[1]!)).toEqual([]);
    const dropped = draft([{ from: "s1", to: "s2", disposition: "dropped" }, { from: "s2", to: "s3" }]);
    expect(automationStudioFlowDraftKeepOpeners(dropped, dropped[1]!)).toEqual([]);
    const unseen = draft([{ from: "s1", to: "s2" }, { from: "s2", to: "s3" }]);
    delete unseen[1]!.stateBefore;
    expect(automationStudioFlowDraftKeepOpeners(unseen, unseen[1]!)).toEqual([]);
  });

  it("stops at a step the model withdrew, and brings only what came after it", () => {
    const steps = draft([{ from: "s0", to: "s1" }, { from: "s1", to: "s2", disposition: "exploratory" }, { from: "s2", to: "s3" }, { from: "s3", to: "s4" }]);
    expect(positions(automationStudioFlowDraftKeepOpeners(steps, steps[3]!))).toEqual([3]);
  });
});

describe("a read the model ran and never added", () => {
  // A list read is a node a Flow is made of (`proposes: true`) that changes
  // nothing on the page (`effect: "observe"`); its digests still differ when it
  // scrolls lazy rows in or pages. As an opener it would store its rows too.
  const read = (step: AutomationStudioFlowDraftStep): AutomationStudioFlowDraftStep => Object.assign(step, { actionId: "read", effect: "observe" as const, proposes: true });

  it("run muw60j7c: adding the filtered read leaves the unfiltered page-1 read it ran to look out of the Flow", () => {
    // 1 open, 2 Decline, 3 Not now, 4 search (all kept), 5 a detect, 6 the
    // unfiltered read that scrolled page 1 to load its last cards (taken),
    // 7 the filtered read over every page, added. The proposed Flow ran both
    // reads into one dataset: 20 unfiltered rows before the 10 filtered ones.
    const steps = draft([
      { from: "blank", to: "home+cookies", disposition: "kept" }, { from: "home+cookies", to: "home+deal", disposition: "kept" },
      { from: "home+deal", to: "home", disposition: "kept" }, { from: "home", to: "results", disposition: "kept" },
      { from: "results", to: "results", look: true }, { from: "results", to: "results-scrolled" }, { from: "results-scrolled", to: "results-page5" }
    ]);
    read(steps[5]!); read(steps[6]!);
    applyAutomationStudioFlowDraftAmendments(steps, [{ step: 7, change: "add" }]);
    expect(inFlow(steps)).toEqual([1, 2, 3, 4, 7]);
    expect(steps[5]!.disposition).toBe("taken");
  });

  it("is passed over, while the press before it that moved the page is still brought", () => {
    // Kept arrival, a taken press to the results, a taken read, then the press added.
    const steps = draft([{ from: "s0", to: "s1", disposition: "kept" }, { from: "s1", to: "s2" }, { from: "s2", to: "s2-scrolled" }, { from: "s2-scrolled", to: "s3" }]);
    read(steps[2]!);
    expect(positions(automationStudioFlowDraftKeepOpeners(steps, steps[3]!))).toEqual([2]);
    expect(steps[2]!.disposition).toBe("taken");
  });

  it("still ends the walk where the model added it: a read in the Flow is where the way starts", () => {
    const steps = draft([{ from: "s0", to: "s1" }, { from: "s1", to: "s1-scrolled", disposition: "kept" }, { from: "s1-scrolled", to: "s2" }, { from: "s2", to: "s3" }]);
    read(steps[1]!);
    expect(positions(automationStudioFlowDraftKeepOpeners(steps, steps[3]!))).toEqual([3]);
  });
});
