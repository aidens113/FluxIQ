// The not-doable ending's count of what was asked, in the person's words.
//
// `run-murdouox-c5294247` (confirm-requests) asked one thing, and the chat read
// "no more of the 1 things you asked had a step (1, as before)".
import { describe, expect, it } from "vitest";
import type { AutomationStudioInstructedActChecklistItem } from "../../instructed-acts/index.ts";
import type { AutomationStudioFlowBootstrapJudgement } from "../contracts.ts";
import { automationStudioFlowBootstrapNotDoable } from "../not-doable.ts";

const judgement = (over: Partial<AutomationStudioFlowBootstrapJudgement> = {}): AutomationStudioFlowBootstrapJudgement => ({
  round: 1, stopped: "unusable_decisions", tested: "replay_failed", testIssueCodes: ["core.replay.failed"], failedSteps: [7],
  stepsInFlow: 8, done: 1, todo: [], lastIssueCodes: [], flowSignature: "same", ...over
});
const act = (id: string, quote: string): AutomationStudioInstructedActChecklistItem => ({ id, verb: "confirm", quote, done: 8 });
const ending = (checklist: AutomationStudioInstructedActChecklistItem[], before: AutomationStudioFlowBootstrapJudgement) =>
  automationStudioFlowBootstrapNotDoable({ judgement: judgement({ done: checklist.length }), checklist, rounds: 2, decisions: 24, noRoute: { kind: "no_progress", before } });

describe("the not-doable ending's count of what was asked", () => {
  it("says thing for one thing asked", () => {
    const one = [act("a1", "confirm everyone I have at least five mutual friends with")];
    const same = ending(one, judgement({ round: 0 })).message;
    expect(same).toContain("no more of the 1 thing you asked had a step (1, as before)");
    expect(same).not.toMatch(/\b1 things\b/u);
    const fewer = ending(one, judgement({ round: 0, done: 2 })).message;
    expect(fewer).toContain("fewer of the 1 thing you asked had a step (1, down from 2)");
  });

  it("says things for more than one", () => {
    const two = [act("a1", "confirm Amara"), act("a2", "confirm Lin")];
    expect(ending(two, judgement({ round: 0, done: 2 })).message).toContain("no more of the 2 things you asked had a step (2, as before)");
  });
});
