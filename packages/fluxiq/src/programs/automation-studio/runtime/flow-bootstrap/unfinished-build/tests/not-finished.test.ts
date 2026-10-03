// The not-finished ending's account of what stood still (t195-w37, moved
// here from the not-doable ending with the stop itself).
//
// `run-murdouox-c5294247` (confirm-requests) asked one thing, and the chat read
// "no more of the 1 things you asked had a step (1, as before)".
// `run-murwcaj0-40e56557` read "the judge found the same as before" while the
// judge had found something else, and "I found no way to" while it said the
// result was still achievable.
import { describe, expect, it } from "vitest";
import type { AutomationStudioInstructedActChecklistItem } from "../../instructed-acts/index.ts";
import type { AutomationStudioFlowBootstrapJudgedWrong, AutomationStudioFlowBootstrapJudgement } from "../contracts.ts";
import { automationStudioFlowBootstrapNotFinished } from "../not-finished.ts";

const judgement = (over: Partial<AutomationStudioFlowBootstrapJudgement> = {}): AutomationStudioFlowBootstrapJudgement => ({
  round: 1, stopped: "unusable_decisions", tested: "replay_failed", testIssueCodes: ["core.replay.failed"], failedSteps: [7],
  stepsInFlow: 8, done: 1, todo: [], lastIssueCodes: [], flowSignature: "same", ...over
});
const act = (id: string, quote: string): AutomationStudioInstructedActChecklistItem => ({ id, verb: "confirm", quote, done: 8 });
const ending = (checklist: AutomationStudioInstructedActChecklistItem[], before: AutomationStudioFlowBootstrapJudgement, after = judgement({ done: checklist.length }), kept = true) =>
  automationStudioFlowBootstrapNotFinished({ judgement: after, checklist, rounds: 2, decisions: 24, stoodStill: { kind: "no_progress", before, rounds: 1 }, kept });

describe("the not-finished ending's count of what was asked", () => {
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

describe("the not-finished ending's account of the judge", () => {
  const judged = (judge: Partial<AutomationStudioFlowBootstrapJudgedWrong>): AutomationStudioFlowBootstrapJudgement =>
    judgement({ stopped: "judged_wrong", tested: "replayed_clean", testIssueCodes: [], failedSteps: [], judge: { verdict: "no", findings: ["result.acts_judged_undone"], ...judge } });
  const one = [act("a1", "confirm everyone I have at least five mutual friends with")];

  it("says what the judge found this time when its advice changed, though its finding codes did not", () => {
    const before = judged({ observed: "no step reads the list after the confirms", advice: "add a read after the confirm loop" });
    const after = judged({ observed: "the confirm acts on Tom Becker", advice: "confirm each row of the read" });
    const message = ending(one, before, after).message;
    expect(message).toContain("this time the judge found: \"the confirm acts on Tom Becker\"");
    expect(message).not.toContain("the judge found the same as before");
    expect(message).toContain("What the judge says is left to change: \"confirm each row of the read\".");
  });

  it("says what the judge found this time when its finding codes changed, though its advice did not", () => {
    const before = judged({ observed: "no read", advice: "read the list" });
    const after = judged({ observed: "the read kept none", advice: "read the list", findings: ["result.no_records_stored"] });
    expect(ending(one, before, after).message).toContain("this time the judge found: \"the read kept none\"");
  });

  it("says the same as before only when both its finding codes and its advice are unchanged", () => {
    const before = judged({ observed: "no read", advice: "read  the list" });
    const after = judged({ observed: "the read is missing", advice: "read the list" });
    expect(ending(one, before, after).message).toContain("the judge found the same as before");
  });

  it("never says no way, and says what was kept as a draft not put into the Flow, or that nothing was", () => {
    const before = judged({ advice: "read the list" });
    const kept = ending(one, before, judged({ advice: "read the list" })).message;
    expect(kept).toMatch(/^I have not finished this Flow yet: /u);
    expect(kept).not.toContain("found no way");
    expect(kept).toContain("The Flow so far was kept as a draft, not put into the Flow, and building again carries on from it.");
    expect(ending(one, before, judged({ advice: "read the list" }), false).message).toContain("Nothing was kept to carry on from.");
  });
});
