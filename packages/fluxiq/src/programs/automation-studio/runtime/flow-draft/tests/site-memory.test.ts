// What a dry run says about a step the site remembers, a step it looked for on
// its own page after another, and a step after a withheld act (t195-w20b).
//
// The replay that produces these is `../../llm/node-tools/tests/replay-draft.test.ts`;
// this is the verdict and what the model is told. Four audits showed the
// refusal offering to drop a step the site remembered, which builds a Flow that
// stops at the wall on a fresh site (t195-w19a B1, w19b #2, w19d C4, w19e risk 2).
import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_REANCHORED_CODE,
  AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_REMEMBERED_CODE,
  automationStudioFlowDraftDryRunFeedback,
  automationStudioFlowDraftDryRunIssueCodes,
  automationStudioFlowDraftDryRunVerdict,
  automationStudioFlowDraftReplayOutcomeWord,
  automationStudioFlowDraftStepWithholdsLater,
  type AutomationStudioFlowDraftReplayOutcome,
  type AutomationStudioFlowDraftStep
} from "../index.ts";
import type { JsonValue } from "../../../../../core/index.ts";

const remembered: AutomationStudioFlowDraftReplayOutcome = { step: 3, stepId: "d3", actionId: "node.decline_cookies", status: "replayed", resultCode: AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_REMEMBERED_CODE };

const at = (location: string) => ({ from: { location } });

const step = (consequences: JsonValue, replay = at("https://s.test/form")): AutomationStudioFlowDraftStep => ({
  position: 2,
  iteration: 2,
  actionId: "node.submit",
  input: { node: "node.submit", parameters: {} },
  ranWith: { node: "node.submit", parameters: { target: "#submit" }, consequences },
  effect: "mutate",
  effectApplied: true,
  disposition: "kept",
  proposes: true,
  replay
});

describe("a step the site remembers", () => {
  it("is shown as remembered, and passes", () => {
    expect(automationStudioFlowDraftReplayOutcomeWord(remembered)).toBe("remembered");
    // Only a step that was run again: a check answers `present` for the same finding.
    expect(automationStudioFlowDraftReplayOutcomeWord({ ...remembered, mode: "verify" })).toBe("replayed");
    expect(automationStudioFlowDraftDryRunVerdict({ attempt: 1, reset: "ok", outcomes: [remembered] }).ok).toBe(true);
  });

  it("is never advised away: the instruction says it stays, and offers dropping only for a step that blocks", () => {
    const failed: AutomationStudioFlowDraftReplayOutcome = { step: 4, stepId: "d4", actionId: "node.click", status: "failed", resultCode: "core.replay.failed" };
    const feedback = automationStudioFlowDraftDryRunFeedback(automationStudioFlowDraftDryRunVerdict({ attempt: 1, reset: "ok", outcomes: [remembered, failed] }));
    expect(feedback.steps).toEqual([
      { step: 3, actionId: "node.decline_cookies", replayed: "remembered", resultCode: AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_REMEMBERED_CODE },
      { step: 4, actionId: "node.click", replayed: "failed", resultCode: "core.replay.failed" }
    ]);
    const instruction = String(feedback.instruction);
    expect(instruction).toContain("remembered: ");
    expect(instruction).toContain("Do not drop, rerun or reorder a remembered step.");
    // Every sentence that offers dropping a step names the answers that block, never remembered.
    const offers = instruction.split(/(?<=\.) /u).filter((sentence) => /\bdrop/iu.test(sentence) && !/Do not drop/u.test(sentence));
    expect(offers.length).toBeGreaterThan(0);
    for (const sentence of offers) expect(sentence).not.toMatch(/remembered/u);
    // The old reading of a missing target, which advised against what the site remembers, is gone.
    expect(instruction).not.toContain("Either the site remembers its effect");
  });
});

describe("a step asked again on its own page", () => {
  it("says it was reanchored beside the second answer, and counts the re-anchor when it still blocks", () => {
    const passed: AutomationStudioFlowDraftReplayOutcome = { ...remembered, step: 9, stepId: "d9", reanchored: true };
    const stillGone: AutomationStudioFlowDraftReplayOutcome = { step: 10, stepId: "d10", actionId: "node.guest", status: "unreproducible", resultCode: "core.replay.unreproducible", reanchored: true };
    const verdict = automationStudioFlowDraftDryRunVerdict({ attempt: 1, reset: "ok", outcomes: [passed, stillGone] });
    expect(verdict.ok).toBe(false);
    expect(automationStudioFlowDraftDryRunFeedback(verdict).steps).toEqual([
      { step: 9, actionId: "node.decline_cookies", replayed: "remembered", resultCode: AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_REMEMBERED_CODE, reanchored: true },
      { step: 10, actionId: "node.guest", replayed: "unreproducible", resultCode: "core.replay.unreproducible", reanchored: true }
    ]);
    expect(automationStudioFlowDraftDryRunIssueCodes(verdict)).toEqual(["llm_evidence_loop.dry_run_refused", "core.replay.unreproducible", AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_REANCHORED_CODE]);
    expect(String(automationStudioFlowDraftDryRunFeedback(verdict).instruction)).toContain("reanchored: true means");
  });
});

describe("which verified steps excuse the steps after them", () => {
  it("one that declared a class a person is asked about, wherever the next step stands", () => {
    for (const consequences of [["send_or_publish"], ["create_new", "move_money"], "delete", " Move_Money , none"] as JsonValue[]) {
      expect(automationStudioFlowDraftStepWithholdsLater(step(consequences), step([])), JSON.stringify(consequences)).toBe(true);
    }
  });

  it("not one that only edits or adds and stays on the page, nor one whose declaration names no class", () => {
    for (const consequences of [["modify_existing"], ["create_new"], "none", { send_or_publish: true }] as JsonValue[]) {
      expect(automationStudioFlowDraftStepWithholdsLater(step(consequences), step([])), JSON.stringify(consequences)).toBe(false);
    }
  });

  it("still one that moved the target, whatever it declared", () => {
    expect(automationStudioFlowDraftStepWithholdsLater(step(["modify_existing"]), step([], at("https://s.test/saved")))).toBe(true);
  });
});
