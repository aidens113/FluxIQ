import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { AUTOMATION_STUDIO_INSTRUCTED_ACT_MISSING_ISSUE_CODE, checkAutomationStudioInstructedActs } from "../check.ts";

const TABLES = "Save the three cheapest dining tables for sale within 5 miles of Kelford to my saved items, then give me a table of everything in my saved items, cheapest first, with columns title, price and status.";

function step(position: number, overrides: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep {
  return { position, id: `d${position}`, iteration: position, actionId: "web.dom.click", input: {}, effect: "mutate", effectApplied: true, disposition: "kept", ...overrides };
}

// `run-mulxk0ro-36bf090d`'s draft: navigate, decline cookies, type, Enter, and
// a read of the first results page. Nothing saved, saved items never opened.
const HALF_A_JOB: AutomationStudioFlowDraftStep[] = [
  step(1, { actionId: "web.navigate" }),
  step(2),
  step(3, { actionId: "web.dom.type" }),
  step(4, { actionId: "web.dom.press_key" }),
  step(5, { actionId: "web.dom.extract_list", effect: "observe", proposes: true })
];

describe("whether the draft does what the instruction asks to be done", () => {
  it("refuses the half-done local-classifieds build, naming both missing acts in the person's words", () => {
    const verdict = checkAutomationStudioInstructedActs({ instructionText: TABLES, result: { summary: "Reads dining tables." }, draftSteps: HALF_A_JOB });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.issue.code).toBe(AUTOMATION_STUDIO_INSTRUCTED_ACT_MISSING_ISSUE_CODE);
    expect(verdict.missing.map((act) => [act.id, act.kind, act.reason])).toEqual([["a1", "save", "no_step_named"], ["a2", "open", "no_step_named"]]);
    expect(JSON.stringify(verdict.missingActs)).toContain("Save the three cheapest dining tables");
  });

  it("accepts each act claimed by its own kept step that changed something", () => {
    const draft = [...HALF_A_JOB, step(6), step(7, { actionId: "web.navigate" })];
    const verdict = checkAutomationStudioInstructedActs({ instructionText: TABLES, result: { summary: "Saves and lists.", acts: [{ action: "save the tables", step: "d6" }, { action: "a2", step: "d7" }] }, draftSteps: draft });
    expect(verdict.ok).toBe(true);
  });

  it.each([
    ["a step that is not there", "d42", "no_such_step"],
    ["a step the model dropped", "d6", "step_not_kept"],
    ["a read that changed nothing", "d5", "step_changed_nothing"]
  ])("refuses a claim naming %s", (_label, named, reason) => {
    const draft = [...HALF_A_JOB, step(6, { disposition: "dropped" }), step(7)];
    const verdict = checkAutomationStudioInstructedActs({ instructionText: TABLES, result: { summary: "x", acts: [{ action: "save", step: named }, { action: "open", step: "d7" }] }, draftSteps: draft });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.missing.map((act) => act.reason)).toEqual([reason]);
  });

  it("refuses one press claimed for two acts", () => {
    const verdict = checkAutomationStudioInstructedActs({ instructionText: TABLES, result: { summary: "x", acts: [{ action: "save", step: "d2" }, { action: "open", step: "d2" }] }, draftSteps: HALF_A_JOB });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.missing.map((act) => [act.id, act.reason])).toEqual([["a2", "step_claimed_twice"]]);
  });

  it("reads claims written as a map from act to step, and steps by position", () => {
    const draft = [...HALF_A_JOB, step(6), step(7)];
    expect(checkAutomationStudioInstructedActs({ instructionText: TABLES, result: { summary: "x", acts: { a1: "6", a2: "step 7" } }, draftSteps: draft }).ok).toBe(true);
  });

  it("checks nothing where the instruction asks for nothing to be done, or the Flow is not the draft", () => {
    expect(checkAutomationStudioInstructedActs({ instructionText: "List each bike once, cheapest first.", result: { summary: "x" }, draftSteps: HALF_A_JOB }).ok).toBe(true);
    expect(checkAutomationStudioInstructedActs({ instructionText: TABLES, result: { summary: "x" } }).ok).toBe(true);
  });

  it("still accepts acts named by their verb or a word of their kind", () => {
    const draft = [...HALF_A_JOB, step(6), step(7, { actionId: "web.navigate" })];
    const verdict = checkAutomationStudioInstructedActs({ instructionText: TABLES, result: { summary: "x", acts: [{ action: "bookmark each table", step: "d6" }, { action: "view saved items", step: "d7" }] }, draftSteps: draft });
    expect(verdict.ok).toBe(true);
  });

  // No count cap (user, 2026-09-30: "Remove ANY AND ALL LIMITS ON THE NUMBER OF
  // ELEMENTS PASSED TO MODEL"). Until then the list stopped at a hundred.
  it("lists every step that changed something, however many there are", () => {
    const draft = Array.from({ length: 120 }, (_unused, index) => step(index + 1));
    const verdict = checkAutomationStudioInstructedActs({ instructionText: TABLES, result: { summary: "x" }, draftSteps: draft });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.missingActs.stepsThatChangedSomething).toHaveLength(120);
    expect(verdict.missingActs).not.toHaveProperty("stepsWithheld");
  });

  it("reads every claim the model made, not the first sixteen", () => {
    const draft = Array.from({ length: 30 }, (_unused, index) => step(index + 1));
    const filler = Array.from({ length: 20 }, (_unused, index) => ({ action: `note `, step: `d${index + 1}` }));
    const named = [...filler, { action: "bookmark each table", step: "d26" }, { action: "view saved items", step: "d27" }];
    const all = checkAutomationStudioInstructedActs({ instructionText: TABLES, result: { summary: "x", acts: named }, draftSteps: [...draft.slice(0, 26), step(27, { actionId: "web.navigate" }), ...draft.slice(27)] });
    expect(all.ok).toBe(true);
  });
});

// `run-muncqlr0-3348202b`, completion #1: the draft kept a consent-dialog click
// (`d4`) and a store-chip click (`d11`), neither of which switched a store or
// added anything to a cart, and the claims named no act. Claims left over were
// once matched to acts in order, so the two clicks passed as the two acts.
describe("a claim answers an act only if it names it", () => {
  const RUN_6 = "Switch my pickup store to Millbrook Crossing Supercenter, then add two packs of the ValueRidge Essentials Select-A-Size Paper Towels in the 12 Double Rolls size and one pack of the ValueRidge Everyday Dinner Napkins in the 250 Count size to my cart, both for pickup. Keep what is already in my cart as it is, and do not check out.";
  const RUN_6_DRAFT: AutomationStudioFlowDraftStep[] = Array.from({ length: 12 }, (_unused, index) => step(index + 1, index + 1 === 4 || index + 1 === 11 ? {} : { disposition: "dropped" }));

  it.each([
    ["a list of claims with no action", [{ action: "", step: "d4" }, { action: "", step: "d11" }]],
    ["a list of claims with no action field at all", [{ step: "d4" }, { step: "d11" }]],
    ["a map whose keys name no act", { "accept cookies": "d4", "choose chip": "d11" }]
  ])("refuses run 6's unrelated clicks given as %s", (_label, acts) => {
    const verdict = checkAutomationStudioInstructedActs({ instructionText: RUN_6, result: { summary: "x", acts: acts as never }, draftSteps: RUN_6_DRAFT });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.missing.length).toBeGreaterThan(0);
    // Every act, and every choice of an item (run 6 is run 28's instruction: a quantity and two sizes).
    expect(verdict.missing.length).toBe(verdict.acts.length + verdict.acts.flatMap((act) => act.requires ?? []).length);
    expect(new Set(verdict.missing.map((act) => act.reason))).toEqual(new Set(["no_step_named"]));
    expect(verdict.instruction).toContain("by its id");
  });

  it("accepts the same clicks once each claim names its act by id", () => {
    const acts = checkAutomationStudioInstructedActs({ instructionText: RUN_6, result: { summary: "x" }, draftSteps: RUN_6_DRAFT }).acts;
    // Each act, then each choice of an item, gets a kept step of its own: d4, d11, then d13 onwards.
    const ids = [...acts.map((act) => act.id), ...acts.flatMap((act) => (act.requires ?? []).map((choice) => choice.id))];
    const kept = ["d4", "d11", ...ids.slice(2).map((_unused, index) => `d${13 + index}`)];
    const draft = [...RUN_6_DRAFT, ...ids.slice(2).map((_unused, index) => step(13 + index))];
    const claims = ids.map((id, index) => ({ action: id, step: kept[index]! }));
    expect(checkAutomationStudioInstructedActs({ instructionText: RUN_6, result: { summary: "x", acts: claims }, draftSteps: draft }).ok).toBe(true);
  });

  const TWO_ADDS = "Add the paper towels to my cart. Add the dinner napkins to my cart.";

  it("gives a claim to the act of its kind whose own words it uses, whatever order the claims come in", () => {
    const draft = [step(1, { actionId: "web.navigate" }), step(2), step(3), step(4, { disposition: "dropped" })];
    const acts = checkAutomationStudioInstructedActs({ instructionText: TWO_ADDS, result: { summary: "x" }, draftSteps: draft }).acts;
    expect(acts.map((act) => [act.id, act.kind])).toEqual([["a1", "add_to"], ["a2", "add_to"]]);
    // The towels claim names a dropped step, so which act it answered shows.
    const verdict = checkAutomationStudioInstructedActs({ instructionText: TWO_ADDS, result: { summary: "x", acts: [{ action: "add napkins", step: "d3" }, { action: "add paper towels", step: "d4" }] }, draftSteps: draft });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.missing.map((act) => [act.id, act.reason, act.step])).toEqual([["a1", "step_not_kept", "d4"]]);
    expect(checkAutomationStudioInstructedActs({ instructionText: TWO_ADDS, result: { summary: "x", acts: [{ action: "add napkins", step: "d3" }, { action: "add paper towels", step: "d2" }] }, draftSteps: draft }).ok).toBe(true);
  });
});

// `run-munoeac4-33c17306` (crossborder-marketplace, run 15): the Flow accepted
// on the second completion was two navigations, both to the build's start
// location, named for putting the hubs in the cart and collecting the coupon.
// A navigation is a step that changed something, so each claim passed; the Flow
// ran and did neither, and Core's own verification refuted it. Run 13
// (`run-munmmj5n-52d8a67d`) was accepted the same way with seven navigations.
// Arriving where the Flow starts does no act but opening it.
describe("a step that only arrives where the Flow starts", () => {
  const HUBS = "Put three of the Voltbay USB-C hub sold by Voltbay Official Store in my cart, and collect that store's coupon.";
  const START = "http://127.0.0.1:59512";
  const arrivesByRun = step(1, { actionId: "web.output.browser-navigate", ranWith: { node: "web.output.browser-navigate", parameters: { url: START } } });
  const arrivesAsWritten = step(2, { actionId: "web.output.browser-navigate", input: { node: "web.output.browser-navigate", parameters: { url: `${START}/` } } });
  const press = (position: number) => step(position, { input: { node: "web.output.dom-click", parameters: { selector: `#control-${position}` } } });
  // "Put three of" asks for a quantity too, which a step of its own sets (d9), so each case here is about the arrivals.
  const quantity = { action: "a1.quantity", step: "d9" };

  it("refuses run 15's two arrivals named for the add to cart and the coupon", () => {
    const verdict = checkAutomationStudioInstructedActs({ instructionText: HUBS, startLocation: START, result: { summary: "x", acts: [{ action: "a1", step: "d1" }, { action: "a2", step: "d2" }, quantity] }, draftSteps: [arrivesByRun, arrivesAsWritten, press(9)] });
    expect(verdict.acts.map((act) => act.kind)).toEqual(["add_to", "claim"]);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.missing.map((act) => [act.id, act.reason, act.step])).toEqual([["a1", "step_only_arrives", "d1"], ["a2", "step_only_arrives", "d2"]]);
    expect(verdict.instruction).toContain("does not do the act");
    expect(verdict.instruction).toContain("press or set the control");
  });

  it("accepts the same acts named for presses that are not arrivals", () => {
    const verdict = checkAutomationStudioInstructedActs({ instructionText: HUBS, startLocation: START, result: { summary: "x", acts: [{ action: "a1", step: "d3" }, { action: "a2", step: "d4" }, quantity] }, draftSteps: [arrivesByRun, arrivesAsWritten, press(3), press(4), press(9)] });
    expect(verdict.ok).toBe(true);
  });

  it("lets an arrival answer an act of opening", () => {
    const opens = "Open my saved items and give me a table of what is there.";
    const acts = checkAutomationStudioInstructedActs({ instructionText: opens, result: { summary: "x" }, draftSteps: [arrivesByRun] }).acts;
    expect(acts.map((act) => act.kind)).toEqual(["open"]);
    expect(checkAutomationStudioInstructedActs({ instructionText: opens, startLocation: START, result: { summary: "x", acts: [{ action: "a1", step: "d1" }] }, draftSteps: [arrivesByRun] }).ok).toBe(true);
  });

  it("gives the plain instruction, with nothing about arriving, when no claim named an arrival", () => {
    const verdict = checkAutomationStudioInstructedActs({ instructionText: HUBS, startLocation: START, result: { summary: "x" }, draftSteps: [arrivesByRun] });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.instruction).not.toContain("does not do the act");
  });

  it("holds nothing to a start location the build was not given", () => {
    expect(checkAutomationStudioInstructedActs({ instructionText: HUBS, result: { summary: "x", acts: [{ action: "a1", step: "d1" }, { action: "a2", step: "d2" }, quantity] }, draftSteps: [arrivesByRun, arrivesAsWritten, press(9)] }).ok).toBe(true);
  });
});

// Lane D's run 2 (`run-munnop9n-5475d593`, social-network-feed): asked to
// confirm everyone with five or more mutual friends, the build pressed one
// Confirm, on the first card, marked it optional and named it for the act. The
// check accepted it; the Flow confirmed one request of four, or none.
describe("an act over every member of a set, and a step the Flow may skip", () => {
  const CONFIRM = "Go through my friend requests and confirm everyone I have at least five mutual friends with, and leave every other request as it is.";
  const listing = step(2, { actionId: "web.dom.extract_list", effect: "observe", proposes: true });
  const confirm = (overrides: Partial<AutomationStudioFlowDraftStep> = {}) => step(3, overrides);
  const claim = { summary: "x", acts: [{ action: "a1", step: "d3" }] };

  it("refuses one press that acts once, and says how to repeat it over the list", () => {
    const verdict = checkAutomationStudioInstructedActs({ instructionText: CONFIRM, result: claim, draftSteps: [step(1, { actionId: "web.navigate" }), listing, confirm()] });
    expect(verdict.acts.map((act) => [act.kind, act.plural])).toEqual([["submit", true]]);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.missing.map((act) => [act.id, act.reason, act.step])).toEqual([["a1", "act_needs_repeat", "d3"]]);
    expect(verdict.instruction).toContain("amend_draft repeat over the listing step through the act's last step");
    expect(JSON.stringify(verdict.missingActs)).toContain("\"plural\":true");
  });

  it("accepts the press once it repeats over the listing step", () => {
    const draft = [step(1, { actionId: "web.navigate" }), listing, confirm({ routing: { kind: "repeat", through: "d3", over: "d2" } })];
    expect(checkAutomationStudioInstructedActs({ instructionText: CONFIRM, result: claim, draftSteps: draft }).ok).toBe(true);
  });

  it("accepts a press that lies inside a span that repeats, and refuses one after it", () => {
    // d3 opens the request's menu and carries the repeat through d5; d4 is the Confirm.
    const draft = [step(1, { actionId: "web.navigate" }), listing, step(3, { routing: { kind: "repeat", through: "d5", over: "d2" } }), step(4), step(5), step(6)];
    expect(checkAutomationStudioInstructedActs({ instructionText: CONFIRM, result: { summary: "x", acts: [{ action: "a1", step: "d4" }] }, draftSteps: draft }).ok).toBe(true);
    const after = checkAutomationStudioInstructedActs({ instructionText: CONFIRM, result: { summary: "x", acts: [{ action: "a1", step: "d6" }] }, draftSteps: draft });
    expect(after.ok).toBe(false);
    if (!after.ok) expect(after.missing.map((act) => act.reason)).toEqual(["act_needs_repeat"]);
  });

  it("does not count a repeat the model withdrew", () => {
    const draft = [step(1, { actionId: "web.navigate" }), listing, step(3, { disposition: "dropped", routing: { kind: "repeat", through: "d4", over: "d2" } }), step(4)];
    const verdict = checkAutomationStudioInstructedActs({ instructionText: CONFIRM, result: { summary: "x", acts: [{ action: "a1", step: "d4" }] }, draftSteps: draft });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.missing.map((act) => act.reason)).toEqual(["act_needs_repeat"]);
  });

  it("refuses run 2's optional Confirm, and says how to make it always run", () => {
    const verdict = checkAutomationStudioInstructedActs({ instructionText: CONFIRM, result: claim, draftSteps: [step(1, { actionId: "web.navigate" }), listing, confirm({ routing: { kind: "optional" } })] });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.missing.map((act) => [act.id, act.reason, act.step])).toEqual([["a1", "step_is_optional", "d3"]]);
    expect(verdict.instruction).toContain("amend_draft keep");
  });

  it("refuses an optional step for an act that is not over a set", () => {
    const draft = [...HALF_A_JOB, step(6, { routing: { kind: "optional" } }), step(7)];
    const verdict = checkAutomationStudioInstructedActs({ instructionText: TABLES, result: { summary: "x", acts: [{ action: "a1", step: "d6" }, { action: "a2", step: "d7" }] }, draftSteps: draft });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.missing.map((act) => [act.id, act.reason])).toEqual([["a1", "step_is_optional"]]);
  });

  it("still accepts a single press for an act that is not over a set, and says nothing about repeating or optional steps otherwise", () => {
    const draft = [...HALF_A_JOB, step(6, { routing: { kind: "only_if", check: "d2" } }), step(7)];
    expect(checkAutomationStudioInstructedActs({ instructionText: TABLES, result: { summary: "x", acts: [{ action: "a1", step: "d6" }, { action: "a2", step: "d7" }] }, draftSteps: draft }).ok).toBe(true);
    const plain = checkAutomationStudioInstructedActs({ instructionText: CONFIRM, result: { summary: "x" }, draftSteps: [listing, confirm()] });
    expect(plain.ok).toBe(false);
    if (plain.ok) return;
    expect(plain.instruction).not.toContain("amend_draft repeat");
    expect(plain.instruction).not.toContain("amend_draft keep");
  });
});

// Live run 28 (`run-munvvc3z-3eadc185`, bigbox-retail): the Flow switched the
// store and pressed add to cart once on each product page, and chose no size
// and set no quantity. It passed with one step per act, and missed the goal.
// A quantity above one and a named size are now each claimed by a step of
// their own, which may be the add press only where its own input sets them.
describe("a quantity or a size the instruction attaches to an item", () => {
  const RUN_28 = "Switch my pickup store to Millbrook Crossing Supercenter, then add two packs of the ValueRidge Essentials Select-A-Size Paper Towels in the 12 Double Rolls size and one pack of the ValueRidge Everyday Dinner Napkins in the 250 Count size to my cart, both for pickup. Keep what is already in my cart as it is, and do not check out.";
  const START = "http://127.0.0.1:59700";
  const go = (position: number, url: string) => step(position, { actionId: "web.output.browser-navigate", input: { node: "web.output.browser-navigate", parameters: { url } } });
  const press = (position: number) => step(position, { actionId: "web.output.dom-click", input: { node: "web.output.dom-click", parameters: { target: { handle: `h${position}` } } } });
  // s1 arrives; s2 consent; s4-s5 the store; s7-s8 search; s9 and s14 product pages; s12 and s15 the add presses.
  const RUN_28_DRAFT = [go(1, START), press(2), press(4), press(5), step(7, { actionId: "web.output.dom-type" }), press(8), go(9, `${START}/p/1`), press(10), press(12), go(14, `${START}/p/2`), press(15)];
  const RUN_28_CLAIMS = [{ action: "a1", step: "d5" }, { action: "a2", step: "d12" }, { action: "a3", step: "d15" }];
  const check = (draftSteps: AutomationStudioFlowDraftStep[], acts: unknown) => checkAutomationStudioInstructedActs({ instructionText: RUN_28, startLocation: START, result: { summary: "x", acts: acts as never }, draftSteps });

  it("refuses run 28's Flow, naming the quantity and both sizes no step chooses", () => {
    const verdict = check(RUN_28_DRAFT, RUN_28_CLAIMS);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.missing.map((missing) => [missing.id, missing.kind, missing.reason])).toEqual([["a2.quantity", "set", "no_step_named"], ["a2.size", "set", "no_step_named"], ["a3.size", "set", "no_step_named"]]);
    const shown = JSON.stringify(verdict.missingActs);
    expect(shown).toContain("\"of\":\"a2\"");
    expect(shown).toContain("in the 12 Double Rolls size");
    expect(verdict.instruction).toContain("choose the size or set the quantity with its own step before adding");
    expect(verdict.instruction).toContain("name that step");
  });

  it("refuses the add press named for its own quantity and size", () => {
    const verdict = check(RUN_28_DRAFT, [...RUN_28_CLAIMS, { action: "a2.quantity", step: "d12" }, { action: "a2.size", step: "d12" }, { action: "a3.size", step: "d15" }]);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.missing.map((missing) => [missing.id, missing.reason])).toEqual([["a2.quantity", "choice_is_the_act_step"], ["a2.size", "choice_is_the_act_step"], ["a3.size", "choice_is_the_act_step"]]);
  });

  it("refuses the arrival, or a step claimed for another act, named for a choice", () => {
    const verdict = check(RUN_28_DRAFT, [...RUN_28_CLAIMS, { action: "a2.quantity", step: "d1" }, { action: "a2.size", step: "d5" }, { action: "a3.size", step: "d15" }]);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.missing.map((missing) => [missing.id, missing.reason])).toEqual([["a2.quantity", "step_only_arrives"], ["a2.size", "step_claimed_twice"], ["a3.size", "choice_is_the_act_step"]]);
  });

  it("accepts a Flow that chooses each size and sets the quantity with steps of its own", () => {
    const draft = [...RUN_28_DRAFT, press(20), press(21), press(22)];
    expect(check(draft, [...RUN_28_CLAIMS, { action: "a2.size", step: "d20" }, { action: "a2.quantity", step: "d21" }, { action: "a3.size", step: "d22" }]).ok).toBe(true);
  });

  it("accepts choices named in words rather than by id", () => {
    const draft = [...RUN_28_DRAFT, press(20), press(21), press(22)];
    const claims = [{ action: "switch store", step: "d5" }, { action: "add towels", step: "d12" }, { action: "add napkins", step: "d15" }, { action: "choose the 12 Double Rolls size", step: "d20" }, { action: "set quantity to two", step: "d21" }, { action: "choose the 250 Count size", step: "d22" }];
    expect(check(draft, claims).ok).toBe(true);
  });

  it("lets the add step answer a choice only where its own input sets it", () => {
    const addWith = (quantity: string) => step(12, { actionId: "shop.add", input: { node: "shop.add", parameters: { amount: quantity, option: "12 Double Rolls" } } });
    const withInput = (quantity: string) => RUN_28_DRAFT.map((each) => each.position === 12 ? addWith(quantity) : each);
    const claims = [...RUN_28_CLAIMS, { action: "a2.quantity", step: "d12" }, { action: "a2.size", step: "d12" }, { action: "a3.size", step: "d20" }];
    expect(check([...withInput("2"), press(20)], claims).ok).toBe(true);
    const wrong = check([...withInput("3"), press(20)], claims);
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.missing.map((missing) => [missing.id, missing.reason])).toEqual([["a2.quantity", "choice_is_the_act_step"]]);
  });

  it("asks for no choice where the instruction names none, and says nothing about choosing", () => {
    const plain = checkAutomationStudioInstructedActs({ instructionText: "Add one pack of the paper towels to my cart.", result: { summary: "x", acts: [{ action: "a1", step: "d2" }] }, draftSteps: [press(2)] });
    expect(plain.ok).toBe(true);
    expect(plain.acts[0]).not.toHaveProperty("requires");
    const tables = checkAutomationStudioInstructedActs({ instructionText: TABLES, result: { summary: "x" }, draftSteps: HALF_A_JOB });
    if (!tables.ok) expect(tables.instruction).not.toContain("set the quantity");
  });
});
