// Which replayed steps a dry run only verifies, and how a verified step reads.
//
// Decision D1 (t174, 2026-09-30): a dry run never repeats a lasting effect. A
// step that changes something and declares a consequence other than none is
// checked rather than run again, and a reader of the verdict can tell the two
// apart. Run 21 (`run-muntufao-7b7bc04a`) is why: two dry-run replays of one
// save press emptied a person's cart.
import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_VERIFIED_CODE,
  automationStudioFlowDraftDryRunFeedback,
  automationStudioFlowDraftDryRunVerdict,
  automationStudioFlowDraftReplayOutcomeWord,
  automationStudioFlowDraftStepReplayMode,
  automationStudioFlowDraftVerifiedFeedback,
  automationStudioFlowDraftWithheldStepIds,
  type AutomationStudioFlowDraftReplayOutcome,
  type AutomationStudioFlowDraftStep
} from "../index.ts";
import type { JsonObject } from "../../../../../core/index.ts";

const step = (over: Partial<AutomationStudioFlowDraftStep> & { consequences?: unknown; noRanWith?: true } = {}): AutomationStudioFlowDraftStep => {
  const { consequences, noRanWith, ...rest } = over;
  const ranWith: JsonObject = { node: "node.click", parameters: { target: "#save" } };
  if (consequences !== undefined) ranWith.consequences = consequences as JsonObject[string];
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

describe("which steps a dry run verifies rather than runs again", () => {
  it("verifies a changing step that declares a lasting consequence", () => {
    expect(automationStudioFlowDraftStepReplayMode(step({ consequences: ["modify_existing"] }))).toBe("verify");
    expect(automationStudioFlowDraftStepReplayMode(step({ consequences: ["send_or_publish", "create_new"] }))).toBe("verify");
    // The authoring spelling: a comma list, and a class Core does not know is
    // still not "none", so it is not repeated either.
    expect(automationStudioFlowDraftStepReplayMode(step({ consequences: "move_money" }))).toBe("verify");
    expect(automationStudioFlowDraftStepReplayMode(step({ consequences: ["purchase"] }))).toBe("verify");
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

  it("reads the declaration the Flow keeps before the one the model wrote", () => {
    const written = step({ noRanWith: true, input: { node: "node.click", parameters: {}, consequences: ["delete"] } });
    expect(automationStudioFlowDraftStepReplayMode(written)).toBe("verify");
    const kept = step({ consequences: [], input: { node: "node.click", parameters: {}, consequences: ["delete"] } });
    expect(automationStudioFlowDraftStepReplayMode(kept)).toBe("replay");
  });
});

describe("how a verified step reads beside the replayed ones", () => {
  const verified: AutomationStudioFlowDraftReplayOutcome = { step: 2, stepId: "p2", actionId: "node.save", status: "replayed", mode: "verify", resultCode: AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_VERIFIED_CODE };

  it("names a verified step verified, and a host that ran it anyway as replayed", () => {
    expect(automationStudioFlowDraftReplayOutcomeWord(verified)).toBe("verified");
    expect(automationStudioFlowDraftReplayOutcomeWord({ ...verified, resultCode: "core.replay.replayed" })).toBe("replayed");
    expect(automationStudioFlowDraftReplayOutcomeWord({ ...verified, status: "unreproducible", resultCode: "core.replay.unreproducible" })).toBe("unreproducible");
    expect(automationStudioFlowDraftReplayOutcomeWord({ step: 1, actionId: "node.click", status: "replayed" })).toBe("replayed");
  });

  it("does not refuse a later step for an effect the dry run withheld", () => {
    const later: AutomationStudioFlowDraftReplayOutcome = { step: 3, stepId: "p3", actionId: "node.read", status: "changed", resultCode: "core.replay.changed", withheldBy: 2 };
    expect(automationStudioFlowDraftWithheldStepIds([verified, later])).toEqual(new Set(["p3"]));
    const verdict = automationStudioFlowDraftDryRunVerdict({
      attempt: 1, reset: "ok", asked: new Set(), outcomes: [verified, later],
      conditional: automationStudioFlowDraftWithheldStepIds([verified, later])
    });
    expect(verdict.ok).toBe(true);
  });

  it("tells the model which steps were verified and which followed a withheld effect", () => {
    const failed: AutomationStudioFlowDraftReplayOutcome = { step: 1, stepId: "p1", actionId: "node.click", status: "failed", resultCode: "core.replay.failed" };
    const later: AutomationStudioFlowDraftReplayOutcome = { step: 3, stepId: "p3", actionId: "node.read", status: "changed", resultCode: "core.replay.changed", withheldBy: 2 };
    const verdict = automationStudioFlowDraftDryRunVerdict({ attempt: 1, reset: "ok", asked: new Set(), outcomes: [failed, verified, later] });
    const feedback = automationStudioFlowDraftVerifiedFeedback(verdict, automationStudioFlowDraftDryRunFeedback(verdict));
    expect(feedback.steps).toEqual([
      { step: 1, actionId: "node.click", replayed: "failed", resultCode: "core.replay.failed" },
      { step: 2, actionId: "node.save", replayed: "verified", resultCode: AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_VERIFIED_CODE },
      { step: 3, actionId: "node.read", replayed: "changed", resultCode: "core.replay.changed", afterWithheld: 2 }
    ]);
    expect(String(feedback.verified)).toContain("not run again");
  });

  it("leaves a verdict with nothing verified exactly as it was", () => {
    const verdict = automationStudioFlowDraftDryRunVerdict({ attempt: 1, reset: "ok", asked: new Set(), outcomes: [{ step: 1, actionId: "node.click", status: "failed" }] });
    const feedback = automationStudioFlowDraftDryRunFeedback(verdict);
    expect(automationStudioFlowDraftVerifiedFeedback(verdict, feedback)).toEqual(feedback);
  });
});
