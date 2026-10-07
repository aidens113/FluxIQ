// A claim the act judge would reject, asked as it is made (`../claim-verdict.ts`,
// W1). Run `run-mux74k5q-1c3c2127` (C1b) put a1 on the press of "Spain", one of
// a1's own options, and was answered "applied".
import { describe, expect, it } from "vitest";
import { applyAutomationStudioFlowDraftAmendments, type AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { automationStudioInstructedActClaimVerdict, automationStudioInstructedActsChecklist } from "../index.ts";

const HUB = "Put three of the Voltbay USB-C hub in my cart: Space Grey, the 7-in-1 version, shipped from Spain.";

function press(position: number, from: string, target: string, overrides: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep {
  return { position, id: `d${position}`, iteration: position, actionId: "web.dom.click", input: {}, effect: "mutate", effectApplied: true, disposition: "kept", words: { target }, replay: { from: { location: from } }, ...overrides };
}

describe("a claim asked as it is made", () => {
  it("is refused on the press of one of the act's own options, with the checklist's sentence, and the draft is untouched", () => {
    const spain = press(5, "item", "Spain", { disposition: "taken" });
    const add = press(7, "item", "Add to cart", { disposition: "taken" });
    const steps = [press(4, "item", "Space Grey", { acts: ["a1.colour"] }), spain, add];
    const before = structuredClone(steps);
    const refused = automationStudioInstructedActClaimVerdict({ instructionText: HUB, steps, step: spain, act: "a1" });
    expect(refused).toMatchObject({ act: "a1", instead: 7 });
    expect(refused?.said).toContain('Step 5 chose "Spain", one of a1\'s options (a1.origin)');
    expect(refused?.said).toContain("Step 7 (\"Add to cart\") names it");
    expect(steps).toEqual(before);
  });

  it("is refused even where the act is claimed on another step today, which keeps it", () => {
    const add = press(7, "item", "Add to cart", { acts: ["a1"] });
    const spain = press(8, "item", "Spain", { disposition: "taken" });
    const steps = [add, spain];
    expect(automationStudioInstructedActClaimVerdict({ instructionText: HUB, steps, step: spain, act: "a1" })).toMatchObject({ act: "a1", instead: 7 });
    expect(add.acts).toEqual(["a1"]);
  });

  it("stands on the press whose words name the act", () => {
    const add = press(7, "item", "Add to cart", { disposition: "taken" });
    expect(automationStudioInstructedActClaimVerdict({ instructionText: HUB, steps: [press(5, "item", "Spain"), add], step: add, act: "a1" })).toBeUndefined();
  });

  it("judges only an act's own id, never a choice, and nothing outside the draft", () => {
    const spain = press(5, "item", "Spain");
    expect(automationStudioInstructedActClaimVerdict({ instructionText: HUB, steps: [spain], step: spain, act: "a1.origin" })).toBeUndefined();
    expect(automationStudioInstructedActClaimVerdict({ instructionText: HUB, steps: [spain], step: press(9, "item", "Spain"), act: "a1" })).toBeUndefined();
    expect(automationStudioInstructedActClaimVerdict({ instructionText: "List the hubs.", steps: [spain], step: spain, act: "a1" })).toBeUndefined();
  });

  // Run `run-muqiho5c-e830ce01`: the add named on "Not now", a layer its own Add to cart opened.
  it("is refused on a step whose change shows nothing of the act while the press before it made the cart rise", () => {
    const add = press(4, "item", "Add to cart", { disposition: "taken", changed: [{ words: "Cart (1)", how: "rose" }] });
    const notNow = press(5, "item", "Not now", { disposition: "taken", changed: [{ words: "Protect your purchase", how: "went" }] });
    const refused = automationStudioInstructedActClaimVerdict({ instructionText: HUB, steps: [add, notNow], step: notNow, act: "a1" });
    expect(refused).toMatchObject({ act: "a1", instead: 4 });
    expect(refused?.said).toBe('Step 5 ("Not now") changed nothing that shows a1, and does not do a1. Step 4 ("Add to cart") shows it: name a1 there with amend_draft add on step 4 with act a1.');
    expect(automationStudioInstructedActClaimVerdict({ instructionText: HUB, steps: [add, notNow], step: add, act: "a1" })).toBeUndefined();
  });
});

// Live run `run-muxky54f-fadb9d03` (lane D round 4, 0031-0038): step 14 pressed
// "Close chat", a chat window over the request list, and the host said it
// answered a layer in front of the page. At 0037 the model sent `14 add act a1`
// with `14 repeat over 12` and both were applied; the next checklist said
// `step_only_clears_the_way`. a1 is plural, so the claim was judged while step 14
// had no repeat yet: `act_needs_repeat` came first and hid what the step did.
describe("a plural act claimed on a press that only cleared the way, before its repeat", () => {
  const FRIENDS = "On my friend requests, confirm everyone I have at least five mutual friends with, and leave every other request as it is. Then give me a table of the requests now shown as accepted, with columns name and mutualFriends.";
  const listing: AutomationStudioFlowDraftStep = {
    position: 12, id: "d12", iteration: 12, actionId: "web.output.dom-extract_list", input: {}, effect: "observe", effectApplied: true, disposition: "kept", proposes: true,
    replay: { from: { location: "requests" } }
  };
  const closeChat = (): AutomationStudioFlowDraftStep => press(14, "requests", "Close chat", { disposition: "dropped", interruption: true, changed: [{ words: "Elena Sokolova", how: "went" }] });

  it("the cause: the checklist reads the claim act_needs_repeat until the repeat is on, and only then what the step did", () => {
    const claimed: AutomationStudioFlowDraftStep = { ...closeChat(), disposition: "kept", acts: ["a1"] };
    const before = automationStudioInstructedActsChecklist({ instructionText: FRIENDS, draftSteps: [listing, claimed] })?.find((each) => each.id === "a1");
    expect(before).toMatchObject({ plural: true, todo: "act_needs_repeat", step: 14 });
    const repeated: AutomationStudioFlowDraftStep = { ...claimed, routing: { kind: "repeat", over: "d12", through: "d14" } };
    const after = automationStudioInstructedActsChecklist({ instructionText: FRIENDS, draftSteps: [listing, repeated] })?.find((each) => each.id === "a1");
    expect(after).toMatchObject({ todo: "step_only_clears_the_way", step: 14 });
  });

  it("is refused as it is made, with the checklist's sentence and the press to run", () => {
    const close = closeChat();
    const steps = [listing, close];
    const refused = automationStudioInstructedActClaimVerdict({ instructionText: FRIENDS, steps, step: close, act: "a1" });
    expect(refused).toEqual({
      act: "a1",
      said: 'Step 14 ("Close chat") only closed something in front of the page, and does not do a1. No step in the draft names it yet: on the page where a1 is done, run the press whose words name it with add true and act a1.'
    });
  });

  it("names a row's Confirm instead when the draft has one, and stands on that Confirm though it is not repeated yet", () => {
    const close = closeChat();
    const confirm = press(15, "requests", "Confirm", { disposition: "taken" });
    const steps = [listing, close, confirm];
    expect(automationStudioInstructedActClaimVerdict({ instructionText: FRIENDS, steps, step: close, act: "a1" })).toMatchObject({ act: "a1", instead: 15 });
    expect(automationStudioInstructedActClaimVerdict({ instructionText: FRIENDS, steps, step: confirm, act: "a1" })).toBeUndefined();
  });

  it("decision 0037 replayed: the claim is refused act_not_done_there, the act stays off the step, and the checklist is not told it done", () => {
    const close = closeChat();
    const steps = [listing, close];
    const claimRefused = (all: readonly AutomationStudioFlowDraftStep[], step: AutomationStudioFlowDraftStep, act: string) =>
      automationStudioInstructedActClaimVerdict({ instructionText: FRIENDS, steps: all, step, act });
    const report = applyAutomationStudioFlowDraftAmendments(steps, [{ step: 14, change: "add", act: "a1" }, { step: 14, change: "repeat", over: 12 }], { claimRefused });
    expect(report.refused).toEqual([expect.objectContaining({ step: 14, reason: "act_not_done_there", act: "a1", said: expect.stringContaining("only closed something in front of the page") as unknown as string })]);
    expect(close.acts).toBeUndefined();
    const item = automationStudioInstructedActsChecklist({ instructionText: FRIENDS, draftSteps: steps })?.find((each) => each.id === "a1");
    expect(item).toMatchObject({ todo: "no_step_added" });
  });
});
