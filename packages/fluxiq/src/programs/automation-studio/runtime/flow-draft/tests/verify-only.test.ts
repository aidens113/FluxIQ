// Which replayed steps a dry run only checks, and how a checked step reads.
//
// Decision D1 (2026-09-30): a dry run never clears site data or logs the person
// out, never repeats a lasting effect, and checks a changing step -- its target
// could take the action, or its effect is already in place -- rather than
// running it again. Run 21 (`run-muntufao-7b7bc04a`) is why: two dry-run
// replays of one save press moved a person's cart lines to the saved list.
import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_PRESENT_CODE,
  AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_VERIFIED_CODE,
  automationStudioFlowDraftDryRunFeedback,
  automationStudioFlowDraftDryRunVerdict,
  automationStudioFlowDraftReplayOutcomeVerified,
  automationStudioFlowDraftReplayOutcomeWord,
  automationStudioFlowDraftStepMovedTarget,
  automationStudioFlowDraftStepReplayMode,
  automationStudioFlowDraftWithheldStepIds,
  type AutomationStudioFlowDraftReplayOutcome,
  type AutomationStudioFlowDraftStep
} from "../index.ts";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";

const step = (over: Partial<AutomationStudioFlowDraftStep> & { consequences?: JsonValue; noRanWith?: true } = {}): AutomationStudioFlowDraftStep => {
  const { consequences, noRanWith, ...rest } = over;
  const ranWith: JsonObject = { node: "node.click", parameters: { target: "#save" } };
  if (consequences !== undefined) ranWith.consequences = consequences;
  return {
    position: 1,
    iteration: 1,
    actionId: "node.click",
    input: { node: "node.click", parameters: {} },
    ...(noRanWith ? {} : { ranWith }),
    effect: "mutate",
    effectApplied: true,
    disposition: "kept",
    proposes: true,
    ...rest
  };
};

/** How the dry run treats a step that is the whole draft: none of these name an act, so nothing after it matters. */
const modeAlone = (alone: AutomationStudioFlowDraftStep) => automationStudioFlowDraftStepReplayMode(alone, [alone]);

describe("which steps a dry run checks rather than runs again", () => {
  it("checks a changing step that declares a lasting consequence", () => {
    expect(modeAlone(step({ consequences: ["modify_existing"] }))).toBe("verify");
    expect(modeAlone(step({ consequences: ["send_or_publish", "create_new"] }))).toBe("verify");
    // The authoring spelling: a comma list, and a class Core does not know is
    // still not "none", so it is not repeated either.
    expect(modeAlone(step({ consequences: "move_money" }))).toBe("verify");
    expect(modeAlone(step({ consequences: ["purchase"] }))).toBe("verify");
    expect(modeAlone(step({ consequences: { move_money: true } }))).toBe("verify");
  });

  it("runs again a changing step that declares nothing lasting", () => {
    for (const consequences of [[], ["none"], "none", "", " none "]) {
      expect(modeAlone(step({ consequences })), JSON.stringify(consequences)).toBe("replay");
    }
  });

  it("runs again a step that only reads, whatever it declared", () => {
    expect(modeAlone(step({ effect: "observe", consequences: ["create_new"] }))).toBe("replay");
  });

  it("runs again a step that declared nothing at all, as before", () => {
    expect(modeAlone(step())).toBe("replay");
  });

  it("reads the declaration the Flow keeps before the one the model wrote", () => {
    const written = step({ noRanWith: true, input: { node: "node.click", parameters: {}, consequences: ["delete"] } });
    expect(modeAlone(written)).toBe("verify");
    const kept = step({ consequences: [], input: { node: "node.click", parameters: {}, consequences: ["delete"] } });
    expect(modeAlone(kept)).toBe("replay");
  });
});

describe("whether a step's own run moved the target", () => {
  const at = (location: string) => ({ replay: { from: { location } } });

  it("did when the next step found the target somewhere else", () => {
    expect(automationStudioFlowDraftStepMovedTarget(step(at("https://s.test/form")), step(at("https://s.test/done")))).toBe(true);
  });

  it("did not when the next step found it where this one did, or when either cannot say", () => {
    expect(automationStudioFlowDraftStepMovedTarget(step(at("https://s.test/cart")), step(at("https://s.test/cart")))).toBe(false);
    expect(automationStudioFlowDraftStepMovedTarget(step(at("https://s.test/cart")), undefined)).toBe(false);
    expect(automationStudioFlowDraftStepMovedTarget(step(), step(at("https://s.test/cart")))).toBe(false);
  });
});

describe("how a checked step reads beside the replayed ones", () => {
  const verified: AutomationStudioFlowDraftReplayOutcome = { step: 2, stepId: "p2", actionId: "node.save", status: "replayed", mode: "verify", resultCode: AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_VERIFIED_CODE };
  const present: AutomationStudioFlowDraftReplayOutcome = { ...verified, resultCode: AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_PRESENT_CODE };

  it("names a checked step verified or present, and a host that ran it anyway replayed", () => {
    expect(automationStudioFlowDraftReplayOutcomeWord(verified)).toBe("verified");
    expect(automationStudioFlowDraftReplayOutcomeWord(present)).toBe("present");
    expect(automationStudioFlowDraftReplayOutcomeWord({ ...verified, resultCode: "core.replay.replayed" })).toBe("replayed");
    expect(automationStudioFlowDraftReplayOutcomeWord({ ...verified, status: "unreproducible", resultCode: "core.replay.unreproducible" })).toBe("unreproducible");
    expect(automationStudioFlowDraftReplayOutcomeWord({ step: 1, actionId: "node.click", status: "replayed" })).toBe("replayed");
  });

  it("withholds an effect only for a step found able to run, not for one whose effect was already there", () => {
    expect(automationStudioFlowDraftReplayOutcomeVerified(verified)).toBe(true);
    expect(automationStudioFlowDraftReplayOutcomeVerified(present)).toBe(false);
  });

  it("passes a verified and a present step, and still blocks an unreproducible check", () => {
    expect(automationStudioFlowDraftDryRunVerdict({ attempt: 1, reset: "ok", outcomes: [verified, { ...present, step: 3, stepId: "p3" }] }).ok).toBe(true);
    const gone: AutomationStudioFlowDraftReplayOutcome = { ...verified, status: "unreproducible", resultCode: "core.replay.unreproducible" };
    expect(automationStudioFlowDraftDryRunVerdict({ attempt: 1, reset: "ok", outcomes: [gone] }).ok).toBe(false);
  });

  it("does not refuse a later step for a withheld move, and names which step withheld it", () => {
    const later: AutomationStudioFlowDraftReplayOutcome = { step: 3, stepId: "p3", actionId: "node.read", status: "changed", resultCode: "core.replay.changed", withheldBy: 2 };
    expect(automationStudioFlowDraftWithheldStepIds([verified, later])).toEqual(new Set(["p3"]));
    const verdict = automationStudioFlowDraftDryRunVerdict({ attempt: 1, reset: "ok", outcomes: [verified, later], conditional: automationStudioFlowDraftWithheldStepIds([verified, later]) });
    expect(verdict.ok).toBe(true);
  });

  it("tells the model which steps were checked and which followed a withheld move", () => {
    const failed: AutomationStudioFlowDraftReplayOutcome = { step: 1, stepId: "p1", actionId: "node.click", status: "failed", resultCode: "core.replay.failed" };
    const later: AutomationStudioFlowDraftReplayOutcome = { step: 3, stepId: "p3", actionId: "node.read", status: "changed", resultCode: "core.replay.changed", withheldBy: 2 };
    const verdict = automationStudioFlowDraftDryRunVerdict({ attempt: 1, reset: "ok", outcomes: [failed, verified, later, { ...present, step: 4, stepId: "p4" }] });
    const feedback = automationStudioFlowDraftDryRunFeedback(verdict);
    expect(feedback.steps).toEqual([
      { step: 1, actionId: "node.click", replayed: "failed", resultCode: "core.replay.failed" },
      { step: 2, actionId: "node.save", replayed: "verified", resultCode: AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_VERIFIED_CODE },
      { step: 3, actionId: "node.read", replayed: "changed", resultCode: "core.replay.changed", afterWithheld: 2 },
      { step: 4, actionId: "node.save", replayed: "present", resultCode: AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_PRESENT_CODE }
    ]);
    expect(String(feedback.instruction)).toContain("not run again");
    expect(String(feedback.instruction)).toContain("present:");
  });
});

// A step that does one of the person's acts is checked, never pressed again,
// whatever it declared (`../verify-only.ts`, t193-1002m-w6 task G).
//
// Live run `run-murwdp4f-35f976d2`: draft step d12, Add to cart, carried act a2
// and declared `consequences: []`. Both build tests pressed it, and the
// person's cart went from 2 to 3 to 4 items where the instruction said "keep
// what is already in my cart". The model under-declared; its own act claim
// says the step does what the person asked done.
const TOWELS = { location: "https://store.test/p/towels" };
const CART = { location: "https://store.test/cart" };

const actStep = (position: number, over: Partial<AutomationStudioFlowDraftStep> = {}, from: { location: string } = TOWELS): AutomationStudioFlowDraftStep => ({
  position,
  id: `d${position}`,
  iteration: position,
  actionId: "web.click",
  input: { node: "web.click", parameters: {} },
  ranWith: { node: "web.click", parameters: { target: `#s${position}` }, consequences: [] },
  effect: "mutate",
  effectApplied: true,
  disposition: "kept",
  proposes: true,
  replay: { from },
  ...over
});

describe("a step that does one of the person's acts", () => {
  it("is checked when it changes something and stays on its page, though it declared nothing lasting", () => {
    const add = actStep(12, { acts: ["a2"] });
    const draft = [actStep(10, { acts: ["a2.size"] }), add, actStep(16, { acts: ["a2.quantity"] })];
    expect(automationStudioFlowDraftStepReplayMode(add, draft)).toBe("verify");
    // The act as the last step of the Flow: nothing after it to have moved.
    expect(automationStudioFlowDraftStepReplayMode(add, [add])).toBe("verify");
  });

  it("is run again when it names only a choice of an act, which is not an act", () => {
    const plus = actStep(16, { acts: ["a2.quantity"] });
    expect(automationStudioFlowDraftStepReplayMode(plus, [actStep(12), plus, actStep(17)])).toBe("replay");
  });

  it("keeps today's rule when the next proposed step found the target elsewhere: later steps stand on the page it opened", () => {
    const opens = actStep(5, { acts: ["a1"] });
    const draft = [opens, actStep(6, { disposition: "taken", proposes: false }, TOWELS), actStep(7, {}, CART)];
    // The taken step 6 is not in the Flow; the next proposed step, 7, is on another page.
    expect(automationStudioFlowDraftStepReplayMode(opens, draft)).toBe("replay");
    // Today's rule still checks it when it declares a lasting consequence.
    const declared = actStep(5, { acts: ["a1"], ranWith: { node: "web.click", parameters: {}, consequences: ["modify_existing"] } });
    expect(automationStudioFlowDraftStepReplayMode(declared, [declared, actStep(7, {}, CART)])).toBe("verify");
  });

  it("is still run again when it only reads, act or not", () => {
    const read = actStep(3, { acts: ["a1"], effect: "observe" });
    expect(automationStudioFlowDraftStepReplayMode(read, [read])).toBe("replay");
  });
});
