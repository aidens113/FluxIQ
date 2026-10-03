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

describe("which steps a dry run checks rather than runs again", () => {
  it("checks a changing step that declares a lasting consequence", () => {
    expect(automationStudioFlowDraftStepReplayMode(step({ consequences: ["modify_existing"] }))).toBe("verify");
    expect(automationStudioFlowDraftStepReplayMode(step({ consequences: ["send_or_publish", "create_new"] }))).toBe("verify");
    // The authoring spelling: a comma list, and a class Core does not know is
    // still not "none", so it is not repeated either.
    expect(automationStudioFlowDraftStepReplayMode(step({ consequences: "move_money" }))).toBe("verify");
    expect(automationStudioFlowDraftStepReplayMode(step({ consequences: ["purchase"] }))).toBe("verify");
    expect(automationStudioFlowDraftStepReplayMode(step({ consequences: { move_money: true } }))).toBe("verify");
  });

  it("runs again a changing step that declares nothing lasting", () => {
    for (const consequences of [[], ["none"], "none", "", " none "]) {
      expect(automationStudioFlowDraftStepReplayMode(step({ consequences })), JSON.stringify(consequences)).toBe("replay");
    }
  });

  it("runs again a step that only reads, whatever it declared", () => {
    expect(automationStudioFlowDraftStepReplayMode(step({ effect: "observe", consequences: ["create_new"] }))).toBe("replay");
  });

  it("runs again a step that declared nothing at all, as before", () => {
    expect(automationStudioFlowDraftStepReplayMode(step())).toBe("replay");
  });

  // Live run `run-murwcaj0-40e56557` (R3): the step that confirmed a friend
  // request, act a1, declared `consequences: []`, so every test pressed Confirm
  // again. An instructed act is lasting by definition (the reader reads only
  // lasting acts), so a changing step that does one is checked whatever it says.
  it("checks a changing step that does an instructed act, whatever it declares", () => {
    for (const consequences of [[], ["none"], "none"]) {
      expect(automationStudioFlowDraftStepReplayMode(step({ consequences, acts: ["a1"] })), JSON.stringify(consequences)).toBe("verify");
    }
    expect(automationStudioFlowDraftStepReplayMode(step({ acts: ["a1"] })), "no declaration").toBe("verify");
    expect(automationStudioFlowDraftStepReplayMode(step({ acts: ["a1"], noRanWith: true }))).toBe("verify");
  });

  it("still runs again a read that carries an act, and a changing step whose act list is empty", () => {
    expect(automationStudioFlowDraftStepReplayMode(step({ effect: "observe", consequences: [], acts: ["a1"] }))).toBe("replay");
    expect(automationStudioFlowDraftStepReplayMode(step({ consequences: [], acts: [] }))).toBe("replay");
  });

  it("reads the declaration the Flow keeps before the one the model wrote", () => {
    const written = step({ noRanWith: true, input: { node: "node.click", parameters: {}, consequences: ["delete"] } });
    expect(automationStudioFlowDraftStepReplayMode(written)).toBe("verify");
    const kept = step({ consequences: [], input: { node: "node.click", parameters: {}, consequences: ["delete"] } });
    expect(automationStudioFlowDraftStepReplayMode(kept)).toBe("replay");
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
