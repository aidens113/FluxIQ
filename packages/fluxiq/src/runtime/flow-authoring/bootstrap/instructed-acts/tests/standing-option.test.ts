// A choice the page already had made when its act's step ran (t1023).
//
// The recorded shape, synthetic: the person asks for one item added "for
// collection"; the site's own chooser shows Collection chosen before any act
// (a chooser the build opened to set a branch), the chooser closes, and the
// add lands. The host states, on the add, the options that stood chosen on
// the page it found (`chosen`, by the page's own typed state). Before t1023
// the checklist counted a choice done only when a step said it made it, so
// `a1.fulfilment` stayed owed for the rest of the build and every refusal
// steered the model to an act already done.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../../draft/index.ts";
import { automationStudioInstructedActsChecklist, automationStudioInstructedActsNotDone, checkAutomationStudioInstructedActs } from "../index.ts";

const LAMP = "Add one of the brass desk lamps to my basket for collection. Then show me my basket as a table with columns item and price.";
const TWO = "Add two of the brass desk lamps to my basket for collection.";

function step(position: number, overrides: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep {
  return { position, id: `d${position}`, iteration: position, actionId: "web.output.dom-click", input: { target: { handle: `h${position}` } }, effect: "mutate", effectApplied: true, disposition: "kept", ...overrides };
}

const COLLECTION = { key: "t40", words: "Collection" };
// d1 opens the chooser (the page it found had it closed), d2 sets the branch with Collection standing, d3 adds with it standing.
const recorded = (addChosen: NonNullable<AutomationStudioFlowDraftStep["chosen"]> = [COLLECTION]): AutomationStudioFlowDraftStep[] => [
  step(1, { words: { target: "Collect or deliver? Eastgate" } }),
  step(2, { words: { target: "Make this my branch" }, chosen: [COLLECTION] }),
  step(3, { words: { target: "+ Add" }, acts: ["a1"], chosen: addChosen })
];

describe("a choice the page already had made when its act's step ran", () => {
  it("is done by the act's own step when that step ran with the option standing chosen", () => {
    const items = automationStudioInstructedActsChecklist({ instructionText: LAMP, draftSteps: recorded() })!;
    expect(items[0]).toMatchObject({ id: "a1", done: 3 });
    const choice = items[0]!.choices![0]!;
    expect(choice).toMatchObject({ id: "a1.fulfilment", value: "collection", done: 3, stoodChosen: "Collection" });
    expect(choice.todo).toBeUndefined();
    // Said as information: what made it done, and what a run on a page that arrives otherwise does.
    expect(choice.stoodChosenSaid).toContain("step 3");
    expect(choice.stoodChosenSaid).toContain("\"Collection\"");
    expect(choice.stoodChosenSaid).toContain("without it");
    expect(automationStudioInstructedActsNotDone(items)).toEqual([]);
    // The completion check reads the same loop and agrees.
    expect(checkAutomationStudioInstructedActs({ instructionText: LAMP, result: { summary: "x" }, draftSteps: recorded() }).ok).toBe(true);
  });

  it("stays owed when the act's step ran with another option standing chosen", () => {
    const items = automationStudioInstructedActsChecklist({ instructionText: LAMP, draftSteps: recorded([{ key: "t41", words: "Delivery" }]) })!;
    expect(items[0]!.choices![0]).toMatchObject({ id: "a1.fulfilment", todo: "no_step_added" });
    expect(automationStudioInstructedActsNotDone(items)).toEqual(["a1.fulfilment"]);
  });

  it("stays owed when only an earlier step found it chosen: the act's own page is what counts", () => {
    const items = automationStudioInstructedActsChecklist({ instructionText: LAMP, draftSteps: recorded([]) })!;
    expect(automationStudioInstructedActsNotDone(items)).toEqual(["a1.fulfilment"]);
  });

  it("is never read from the act step's words or from page text that only mentions the option", () => {
    const draft = [step(1, { words: { target: "+ Add for collection" }, acts: ["a1"], changed: [{ words: "Collection at Eastgate", how: "appeared" }] })];
    expect(automationStudioInstructedActsNotDone(automationStudioInstructedActsChecklist({ instructionText: LAMP, draftSteps: draft }))).toEqual(["a1.fulfilment"]);
  });

  it("does not count when the act itself is not done", () => {
    const draft = recorded().map((each) => (each.position === 3 ? { ...each, disposition: "taken" as const } : each));
    expect(automationStudioInstructedActsNotDone(automationStudioInstructedActsChecklist({ instructionText: LAMP, draftSteps: draft }))).toEqual(["a1", "a1.fulfilment"]);
  });

  it("leaves a step named for the choice as the one that does it", () => {
    const draft = [step(1, { words: { target: "Collection" }, acts: ["a1.fulfilment"] }), ...recorded().slice(1).map((each) => ({ ...each, position: each.position + 1, id: `d${each.position + 1}` }))];
    const choice = automationStudioInstructedActsChecklist({ instructionText: LAMP, draftSteps: draft })![0]!.choices![0]!;
    expect(choice).toMatchObject({ done: 1 });
    expect(choice.stoodChosen).toBeUndefined();
  });

  it("answers the choice claimed on the act's own press, which ran with it standing", () => {
    const draft = recorded().map((each) => (each.position === 3 ? { ...each, acts: ["a1", "a1.fulfilment"] } : each));
    const items = automationStudioInstructedActsChecklist({ instructionText: LAMP, draftSteps: draft })!;
    expect(items[0]!.choices![0]).toMatchObject({ done: 3, stoodChosen: "Collection" });
    expect(automationStudioInstructedActsNotDone(items)).toEqual([]);
  });

  it("never answers a quantity: how many is set, not chosen beforehand", () => {
    const draft = recorded([COLLECTION, { key: "t50", words: "2" }]);
    const items = automationStudioInstructedActsChecklist({ instructionText: TWO, draftSteps: draft })!;
    expect(automationStudioInstructedActsNotDone(items)).toEqual(["a1.quantity"]);
  });
});
