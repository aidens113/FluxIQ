// The instructed acts as the model's checklist beside its draft (audit A1,
// cause 1): the same reading and the same rule the completion check applies,
// so an act shown done is an act a completion accepts.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import {
  automationStudioInstructedActsChecklist,
  automationStudioInstructedActsNotDone,
  checkAutomationStudioInstructedActs
} from "../index.ts";

const TABLES = "Save the three cheapest dining tables for sale within 5 miles of Kelford to my saved items, then give me a table of everything in my saved items, cheapest first, with columns title, price and status.";

function step(position: number, overrides: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep {
  return { position, id: `d${position}`, iteration: position, actionId: "web.dom.click", input: {}, effect: "mutate", effectApplied: true, disposition: "kept", ...overrides };
}

describe("the acts checklist", () => {
  it("warns about a cart act claimed on a same-place choice without changing claim coverage", () => {
    const draft = [step(1, { acts: ["a1"], words: { target: "Spain" } })];
    const items = automationStudioInstructedActsChecklist({ instructionText: "Add the hub to my cart.", draftSteps: draft })!;
    expect(items[0]).toMatchObject({ done: 1, claimSaid: expect.stringContaining('"Spain"') });
    expect((items[0] as { claimSaid?: string }).claimSaid).toContain("distinct step");
    expect(items[0]!.todo).toBeUndefined();
    expect(automationStudioInstructedActsNotDone(items)).toEqual([]);
    expect(draft[0]!.acts).toEqual(["a1"]);
    expect(checkAutomationStudioInstructedActs({ instructionText: "Add the hub to my cart.", result: { summary: "x" }, draftSteps: draft }).ok).toBe(true);
  });
  it("shows every act as todo before anything is authored, with the ids a completion is judged by", () => {
    const items = automationStudioInstructedActsChecklist({ instructionText: TABLES, draftSteps: [] })!;
    const verdict = checkAutomationStudioInstructedActs({ instructionText: TABLES, result: { summary: "x" }, draftSteps: [step(1, { disposition: "taken" })] });
    expect(items.map((item) => [item.id, item.todo])).toEqual([["a1", "no_step_added"], ["a2", "no_step_added"]]);
    // The ids a refusal would name are the ids shown from the first decision.
    expect(verdict.ok ? [] : verdict.missing.map((act) => act.id)).toEqual(items.map((item) => item.id));
    expect(items[0]).toMatchObject({ verb: "save", quote: expect.stringContaining("dining tables") });
    expect(automationStudioInstructedActsNotDone(items)).toEqual(["a1", "a2"]);
  });

  it("shows an act done by the step of the Flow the model said does it, and a completion then needs no claim", () => {
    const draft = [step(1, { disposition: "taken" }), step(2, { acts: ["a1"] }), step(3, { acts: ["a2"] })];
    const items = automationStudioInstructedActsChecklist({ instructionText: TABLES, draftSteps: draft })!;
    expect(items.map((item) => [item.id, item.done, item.todo])).toEqual([["a1", 2, undefined], ["a2", 3, undefined]]);
    expect(checkAutomationStudioInstructedActs({ instructionText: TABLES, result: { summary: "Saves and lists." }, draftSteps: draft }).ok).toBe(true);
  });

  it("names why a step said to do an act does not, by the check's own rule", () => {
    const draft = [step(1, { acts: ["a1"], disposition: "taken" }), step(2, { acts: ["a2"], effect: "observe" })];
    const items = automationStudioInstructedActsChecklist({ instructionText: TABLES, draftSteps: draft })!;
    // A step that only reads is said to, not lumped with a press that failed.
    expect(items.map((item) => [item.id, item.todo, item.step])).toEqual([["a1", "step_not_kept", 1], ["a2", "step_only_reads", 2]]);
    // The check refuses the same two steps, by the positions the checklist shows.
    const verdict = checkAutomationStudioInstructedActs({ instructionText: TABLES, result: { summary: "x" }, draftSteps: draft });
    expect(verdict.ok ? [] : verdict.missing.map((act) => [act.id, act.reason, act.step])).toEqual([["a1", "step_not_kept", "1"], ["a2", "step_changed_nothing", "2"]]);
  });

  it("does not count an act off a step the model has not put in the Flow", () => {
    const draft = [step(1, { acts: ["a1"], disposition: "taken" }), step(2, { acts: ["a2"] })];
    expect(automationStudioInstructedActsNotDone(automationStudioInstructedActsChecklist({ instructionText: TABLES, draftSteps: draft }))).toEqual(["a1"]);
    expect(checkAutomationStudioInstructedActs({ instructionText: TABLES, result: { summary: "x" }, draftSteps: draft }).ok).toBe(false);
  });

  it("lists each act's choices beside it, done or todo, by the check's own rule", () => {
    const TOWELS = "Add two packs of the Softly Paper Towels in the 12 Double Rolls size to my cart.";
    const empty = automationStudioInstructedActsChecklist({ instructionText: TOWELS, draftSteps: [] })!;
    expect(empty.map((item) => [item.id, item.todo, item.choices?.map((choice) => [choice.id, choice.choice, choice.value, choice.todo])])).toEqual([
      ["a1", "no_step_added", [["a1.quantity", "quantity", "two", "no_step_added"], ["a1.size", "variant", "12 Double Rolls", "no_step_added"]]]
    ]);
    expect(automationStudioInstructedActsNotDone(empty)).toEqual(["a1", "a1.quantity", "a1.size"]);

    // The size chosen by its own step, the quantity claimed by the add itself, which was given no number.
    const draft = [step(1, { acts: ["a1.size"] }), step(2, { acts: ["a1", "a1.quantity"] })];
    const items = automationStudioInstructedActsChecklist({ instructionText: TOWELS, draftSteps: draft })!;
    expect(items[0]!.done).toBe(2);
    expect(items[0]!.choices!.map((choice) => [choice.id, choice.done, choice.todo, choice.step])).toEqual([
      ["a1.quantity", undefined, "choice_is_the_act_step", 2],
      ["a1.size", 1, undefined, undefined]
    ]);
    // The check refuses exactly what the checklist shows as todo.
    const verdict = checkAutomationStudioInstructedActs({ instructionText: TOWELS, result: { summary: "x" }, draftSteps: draft });
    expect(verdict.ok ? [] : verdict.missing.map((missing) => [missing.id, missing.reason])).toEqual([["a1.quantity", "choice_is_the_act_step"]]);

    // An add given the number makes the quantity too, and then the check accepts the Flow.
    const given = [step(1, { acts: ["a1.size"] }), step(2, { acts: ["a1", "a1.quantity"], input: { quantity: "2" } })];
    const done = automationStudioInstructedActsChecklist({ instructionText: TOWELS, draftSteps: given })!;
    expect(automationStudioInstructedActsNotDone(done)).toEqual([]);
    expect(checkAutomationStudioInstructedActs({ instructionText: TOWELS, result: { summary: "x" }, draftSteps: given }).ok).toBe(true);
  });

  it("is nothing for an instruction that asks only for something to be read", () => {
    expect(automationStudioInstructedActsChecklist({ instructionText: "List the dining tables for sale in Kelford.", draftSteps: [] })).toBeUndefined();
  });
});

// Live run 36 (`run-muq3uozx-3153564b`): the checklist showed a1 done by the
// repeated Confirm while the check, judging only the first step naming a1 (the
// list read), refused 24 completions. Both now share one loop, so over any
// draft the checklist shows everything done exactly when the check accepts it,
// and shows as not done exactly what the check refuses.
describe("the checklist and the check agree on every draft", () => {
  const CONFIRM = "Go through my friend requests and confirm everyone I have at least five mutual friends with, and leave every other request as it is.";
  const TOWELS = "Add two packs of the Softly Paper Towels in the 12 Double Rolls size to my cart.";
  const read = (position: number, acts?: string[]) => step(position, { actionId: "web.dom.extract_list", effect: "observe", proposes: true, ...(acts ? { acts } : {}) });
  const repeated = (position: number, over: number, acts?: string[]) => step(position, { routing: { kind: "repeat", over: `d${over}`, through: `d${position}` }, ...(acts ? { acts } : {}) });
  const cases: Array<readonly [string, string, AutomationStudioFlowDraftStep[]]> = [
    ["run 36: the read and the repeated Confirm both named", CONFIRM, [read(1, ["a1"]), repeated(2, 1, ["a1"])]],
    ["run 36 as its draft stood: two reads, the repeated Confirm, a Confirm once", CONFIRM, [read(1, ["a1"]), read(2, ["a1"]), repeated(3, 2, ["a1"]), step(4, { acts: ["a1"] })]],
    ["only the read named", CONFIRM, [read(1, ["a1"]), repeated(2, 1)]],
    ["the read and a Confirm that acts once", CONFIRM, [read(1, ["a1"]), step(2, { acts: ["a1"] })]],
    ["a dropped Confirm, then the repeated one", CONFIRM, [read(1), step(2, { acts: ["a1"], disposition: "dropped" }), repeated(3, 1, ["a1"])]],
    ["an optional Confirm", CONFIRM, [read(1), step(2, { acts: ["a1"], routing: { kind: "optional" } })]],
    ["nothing named", TABLES, [step(1), step(2)]],
    ["each act its own press", TABLES, [step(1, { acts: ["a1"] }), step(2, { acts: ["a2"] })]],
    ["one press named for both acts", TABLES, [step(1, { acts: ["a1", "a2"] })]],
    ["a read, then the press, named for the save", TABLES, [read(1, ["a1"]), step(2, { acts: ["a1"] }), step(3, { acts: ["a2"] })]],
    ["the add named for its own quantity", TOWELS, [step(1, { acts: ["a1.size"] }), step(2, { acts: ["a1", "a1.quantity"] })]],
    ["the add given its quantity", TOWELS, [step(1, { acts: ["a1.size"] }), step(2, { acts: ["a1", "a1.quantity"], input: { quantity: "2" } })]],
    ["one step named for both choices", TOWELS, [step(1, { acts: ["a1.size", "a1.quantity"] }), step(2, { acts: ["a1"] })]],
    ["the choices on their own steps, after a read naming the add", TOWELS, [read(1, ["a1"]), step(2, { acts: ["a1.size"] }), step(3, { acts: ["a1.quantity"] }), step(4, { acts: ["a1"] })]]
  ];

  it.each(cases)("%s", (_label, instructionText, draftSteps) => {
    const notDone = automationStudioInstructedActsNotDone(automationStudioInstructedActsChecklist({ instructionText, draftSteps }));
    const verdict = checkAutomationStudioInstructedActs({ instructionText, result: { summary: "x" }, draftSteps });
    expect(verdict.ok).toBe(notDone.length === 0);
    expect(verdict.ok ? [] : verdict.missing.map((missing) => missing.id)).toEqual(notDone);
  });

  it("covers drafts the check accepts and drafts it refuses", () => {
    const verdicts = cases.map(([, instructionText, draftSteps]) => checkAutomationStudioInstructedActs({ instructionText, result: { summary: "x" }, draftSteps }).ok);
    expect(verdicts.filter(Boolean).length).toBeGreaterThanOrEqual(4);
    expect(verdicts.filter((ok) => !ok).length).toBeGreaterThanOrEqual(4);
  });
});

// Live run `run-murz83zy-5030820f` (R10): the last draft kept step 6, a Confirm
// on Tom Becker's card that did a1 once, beside step 13, the Confirm repeated
// over the filtered listing at step 7. Playback would accept Tom's request
// whatever his mutual friends. The schema says to drop such a step; the
// checklist never said it about these steps. Now a plural act done by a
// repeated step names, with numbers, every kept step that does the same act to
// one row, and says to drop it. Information beside a done act, never a todo of
// its own: the check and the completion gate are unchanged.
describe("a plural act done by a repeat names the steps that do it to one row", () => {
  const CONFIRM = "Go through my friend requests and confirm everyone I have at least five mutual friends with, and leave every other request as it is. Then give me a table of every request the list now shows as accepted, in the order the list shows them, with columns name and mutualFriends, where mutualFriends is written exactly as their request shows it.";
  const press = (position: number, target: string, overrides: Partial<AutomationStudioFlowDraftStep> = {}) =>
    step(position, { actionId: "web.output.dom-click", words: { target }, input: { consequences: ["modify_existing"] }, ...overrides });
  const listing = (position: number) => step(position, { actionId: "web.output.dom-extract_list", effect: "observe", proposes: true });
  const look = (position: number) => step(position, { actionId: "web.output.dom-capture_snapshot", effect: "observe", effectApplied: false, disposition: "taken" });
  // The run's last draft, steps 1-13, as 0083 showed it.
  const run = (): AutomationStudioFlowDraftStep[] => [
    step(1, { actionId: "web.output.browser-navigate" }), press(2, "Decline optional cookies"), press(3, "Friends"), press(4, "Close chat"), press(5, "Friend requests"),
    press(6, "Confirm"), listing(7), listing(8), look(9), look(10), look(11), look(12),
    press(13, "Confirm", { acts: ["a1"], routing: { kind: "repeat", through: "d13", over: "d7" } })
  ];

  it("says to drop the Confirm done once, with the numbers, beside the act done by the repeat", () => {
    const draft = run();
    draft[7] = { ...draft[7]!, disposition: "dropped" };
    const a1 = automationStudioInstructedActsChecklist({ instructionText: CONFIRM, draftSteps: draft })![0]!;
    expect(a1).toMatchObject({ id: "a1", plural: true, done: 13, drop: [6] });
    expect(a1.dropSaid).toBe("step 6 does a1 to one row; step 13 does it to each row step 7 keeps: drop step 6");
    expect(a1.todo).toBeUndefined();
    // Information only: the check accepts this draft as it did, and a1 counts as done.
    expect(checkAutomationStudioInstructedActs({ instructionText: CONFIRM, result: { summary: "x" }, draftSteps: draft }).ok).toBe(true);
    expect(automationStudioInstructedActsNotDone([a1])).toEqual([]);
  });

  it("names a press of the same control and a step the model named for the act once, and leaves alone a press of another control, a step out of the Flow, one inside the repeat and one claimed for another act", () => {
    const draft = [
      press(1, "Friend requests"), press(2, "Confirm"), press(3, "Confirm", { disposition: "dropped" }), press(4, "Confirm", { effectApplied: false }),
      press(5, "Confirm", { acts: ["a9"] }), listing(6), press(7, "Confirm", { acts: ["a1"], routing: { kind: "repeat", through: "d8", over: "d6" } }), press(8, "Confirm"),
      press(9, "Accept", { acts: ["a1"] }), press(10, "Delete")
    ];
    const a1 = automationStudioInstructedActsChecklist({ instructionText: CONFIRM, draftSteps: draft })![0]!;
    expect(a1.done).toBe(7);
    expect(a1.drop).toEqual([2, 9]);
    expect(a1.dropSaid).toBe("steps 2 and 9 do a1 to one row each; step 7 does it to each row step 6 keeps: drop steps 2 and 9");
  });

  it("says nothing when no other step does the act, or the act is not done by a repeat", () => {
    const alone = run().filter((each) => each.position !== 6).map((each, index) => ({ ...each, position: index + 1 }));
    expect(automationStudioInstructedActsChecklist({ instructionText: CONFIRM, draftSteps: alone })![0]!.drop).toBeUndefined();
    const once = [press(1, "Confirm"), press(2, "Confirm", { acts: ["a1"] })];
    const a1 = automationStudioInstructedActsChecklist({ instructionText: CONFIRM, draftSteps: once })![0]!;
    expect(a1.todo).toBe("act_needs_repeat");
    expect(a1.drop).toBeUndefined();
  });
});
