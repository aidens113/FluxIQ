// What the person reads about acts not done and the last test (live run 36,
// `run-muq3uozx-3153564b`): the ending said "the step I tried for it changed
// nothing" of a list read named for confirming people, and that the Flow "ran
// from its start without failing" while every completion had been refused for
// its act.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { automationStudioInstructedActsChecklist } from "../../instructed-acts/index.ts";
import type { AutomationStudioFlowBootstrapJudgement } from "../contracts.ts";
import { automationStudioFlowBootstrapNotDone, automationStudioFlowBootstrapNotDoneSaid, automationStudioFlowBootstrapTestSaid } from "../not-done.ts";

const CONFIRM = "Go through my friend requests and confirm everyone I have at least five mutual friends with, and leave every other request as it is.";

function step(position: number, overrides: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep {
  return { position, id: `d${position}`, iteration: position, actionId: "web.dom.click", input: {}, effect: "mutate", effectApplied: true, disposition: "kept", ...overrides };
}

function judgement(overrides: Partial<AutomationStudioFlowBootstrapJudgement>): AutomationStudioFlowBootstrapJudgement {
  return { round: 1, stopped: "unusable_decisions", tested: "replayed_clean", testIssueCodes: [], failedSteps: [], stepsInFlow: 7, done: 0, todo: ["a1"], lastIssueCodes: [], ...overrides };
}

describe("what the person is told is not done", () => {
  it("says an act named only on a read only read the page, not that it changed nothing", () => {
    const read = step(1, { actionId: "web.dom.extract_list", effect: "observe", proposes: true, acts: ["a1"] });
    const notDone = automationStudioFlowBootstrapNotDone(automationStudioInstructedActsChecklist({ instructionText: CONFIRM, draftSteps: [read, step(2)] }));
    expect(notDone.map((item) => [item.id, item.todo])).toEqual([["a1", "step_only_reads"]]);
    const said = automationStudioFlowBootstrapNotDoneSaid(notDone);
    expect(said).toContain("the step I named for it only read the page, and did not do it");
    expect(said).not.toContain("changed nothing");
  });

  it("still says a press that changed nothing changed nothing", () => {
    const failed = step(1, { acts: ["a1"], effectApplied: false });
    const said = automationStudioFlowBootstrapNotDoneSaid(automationStudioFlowBootstrapNotDone(automationStudioInstructedActsChecklist({ instructionText: CONFIRM, draftSteps: [failed] })));
    expect(said).toContain("the step I tried for it changed nothing");
  });
});

describe("what the person is told the last test found", () => {
  it("does not say a clean run was without failing when none of what was asked is done", () => {
    const said = automationStudioFlowBootstrapTestSaid(judgement({ done: 0, todo: ["a1"] }));
    expect(said).toBe("The Flow as far as it got (7 steps) ran from its start, but it does none of what you asked.");
  });

  it("does not say it either when some of what was asked is still not done", () => {
    const said = automationStudioFlowBootstrapTestSaid(judgement({ done: 1, todo: ["a2"] }));
    expect(said).toBe("The Flow as far as it got (7 steps) ran from its start, but it does not yet do all you asked.");
  });

  it("says a clean run was without failing when everything asked is done", () => {
    expect(automationStudioFlowBootstrapTestSaid(judgement({ done: 1, todo: [] }))).toBe("The Flow as far as it got (7 steps) ran from its start without failing.");
  });
});
