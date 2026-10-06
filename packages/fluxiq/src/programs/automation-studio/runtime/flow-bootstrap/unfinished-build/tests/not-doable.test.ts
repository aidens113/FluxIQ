// The not-doable ending: only the judge's word that what was asked can no
// longer be had (t195-w37), and its count of what was asked in the person's
// words. One thing asked is a thing: `run-murz83zy-5030820f` read "1 of the 1
// things you asked". What stood still after a repair that got no further is
// the not-finished ending's now (`./not-finished.test.ts`).
import { describe, expect, it } from "vitest";
import type { AutomationStudioInstructedActChecklistItem } from "../../instructed-acts/index.ts";
import type { AutomationStudioFlowBootstrapJudgement } from "../contracts.ts";
import { automationStudioFlowBootstrapNotDoable } from "../not-doable.ts";

const judgement = (over: Partial<AutomationStudioFlowBootstrapJudgement> = {}): AutomationStudioFlowBootstrapJudgement => ({
  round: 0, stopped: "judged_wrong", tested: "replayed_clean", testIssueCodes: [], failedSteps: [],
  stepsInFlow: 8, done: 0, todo: ["a1"], lastIssueCodes: [], flowSignature: "same",
  judge: { verdict: "no", observed: "the account has no friend requests left", findings: ["result.acts_judged_undone"], stillAchievable: "no" }, ...over
});
const act = (id: string, quote: string): AutomationStudioInstructedActChecklistItem => ({ id, verb: "confirm", quote });
const ending = (checklist: AutomationStudioInstructedActChecklistItem[]) =>
  automationStudioFlowBootstrapNotDoable({ judgement: judgement(), checklist, rounds: 1, decisions: 12, noRoute: { kind: "judged_unachievable" } });

describe("the not-doable ending", () => {
  it("says the judge found what was asked can no longer be done, and records that case", () => {
    const said = ending([act("a1", "confirm Amara")]);
    expect(said.message).toMatch(/^I could not build this Flow, and I found no way to: it was tested from its start and judged not to do what you asked/u);
    expect(said.message).toContain("and the last attempt ended when the judge found that what you asked can no longer be done.");
    expect(said.tried.noRoute).toEqual({ kind: "judged_unachievable" });
  });

  it("says the one thing asked as one thing, never \"1 of the 1 things\"", () => {
    const message = ending([act("a1", "confirm everyone I have at least five mutual friends with")]).message;
    expect(message).toContain("The one thing you asked could not be done: \"confirm everyone I have at least five mutual friends with\"");
    expect(message).not.toMatch(/\b1 things\b/u);
  });

  it("says things for more than one", () => {
    expect(ending([act("a1", "confirm Amara"), act("a2", "confirm Lin")]).message).toContain("2 of the 2 things you asked could not be done");
  });
});
