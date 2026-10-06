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
    expect(same).toContain("the one thing you asked has a step as it did before");
    expect(same).not.toMatch(/\b1 things\b/u);
    const fewer = ending(one, judgement({ round: 0, done: 2 })).message;
    expect(fewer).toContain("the one thing you asked no longer has a step");
  });

  it("says things for more than one", () => {
    const two = [act("a1", "confirm Amara"), act("a2", "confirm Lin")];
    expect(ending(two, judgement({ round: 0, done: 2 })).message).toContain("2 of the 2 things you asked have a step, no more than before");
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

  // Live run `run-musp4h2f-72e8ed99`: the attempt before was judged no twice, the
  // last no then yes, and the ending said "the judge still could not judge it".
  it("says the judge no longer agreed it was wrong when the attempt before was judged no and one of the last pair said yes", () => {
    const before = judged({ advice: "read the list" });
    const after = judged({ verdict: "unknown", findings: ["checked twice, the answers differed"], oneCallSaidYes: true });
    const message = ending(one, before, after).message;
    expect(message).toContain("the judge no longer agreed it was wrong, as one of its two checks said it does what you asked");
    expect(message).not.toContain("still could not");
  });

  it("never says still could not tell after an attempt judged no, when no call of the last pair said yes", () => {
    const before = judged({ advice: "read the list" });
    const after = judged({ verdict: "unknown", findings: ["checked twice, neither said yes"] });
    const message = ending(one, before, after).message;
    expect(message).toContain("the judge could not tell this time whether it does what you asked, though it had found the attempt before wrong");
    expect(message).not.toContain("still could not");
  });

  it("says the judge still could not tell when it could not tell the time before either", () => {
    const before = judged({ verdict: "unknown", findings: ["unsure"] });
    const after = judged({ verdict: "unknown", findings: ["unsure"], oneCallSaidYes: true });
    expect(ending(one, before, after).message).toContain("the judge still could not tell whether it does what you asked");
  });

  it("says a judge that now found it wrong after one that could not tell as exactly that (t195-w48)", () => {
    const before = judged({ verdict: "unknown", findings: ["unsure"] });
    expect(ending(one, before, judged({ advice: "read the list" })).message).toContain("the judge now found it does not do what you asked");
  });

  it("never says no way, and says the steps found so far were kept as a draft, or that nothing was", () => {
    const before = judged({ advice: "read the list" });
    const kept = ending(one, before, judged({ advice: "read the list" })).message;
    expect(kept).toMatch(/^I have not finished this Flow yet\. /u);
    expect(kept).not.toContain("found no way");
    expect(kept).toContain("The steps I found so far were kept as a draft, so building again carries on from them.");
    expect(ending(one, before, judged({ advice: "read the list" }), false).message).toContain("Nothing was kept to carry on from.");
  });
});

// Live run `run-musp4h2f-72e8ed99` (t193 round 1003, debug cause 4, D10/D11):
// the same point said twice, the judge's doubt -- the towel quantity of two,
// which one check said was unproven -- never said.
describe("the not-finished ending of run-musp4h2f-72e8ed99", () => {
  const items = [
    "Switch my pickup store to Millbrook Crossing Supercenter",
    "add two packs of the ValueRidge Essentials Select-A-Size Paper Towels",
    "in the 12 Double Rolls size",
    "add one pack of the ValueRidge Everyday Dinner Napkins",
    "in the 250 Count size",
    "both for pickup"
  ].map((quote, index): AutomationStudioInstructedActChecklistItem => ({ id: `a${index + 1}`, verb: "add", quote, done: index + 2 }));
  const doubt = "step 9 clicked '+' once, which raises the quantity from the default 1 to 2 only if the default was 1, and the test gives no observation of the resulting quantity";
  const round = (judge: AutomationStudioFlowBootstrapJudgedWrong, at: number): AutomationStudioFlowBootstrapJudgement =>
    judgement({ round: at, stopped: "judged_wrong", tested: "replayed_clean", testIssueCodes: [], failedSteps: [], stepsInFlow: 16, done: 6, proven: 6, todo: [], judge, flowSignature: `f${at}` });
  const before = round({ verdict: "no", findings: [], observed: "the 3-Pack path is still in the Flow", advice: "drop steps 12 to 16" }, 2);
  const after = round({ verdict: "unknown", findings: ["checked twice, the answers differed"], oneCallSaidYes: true, unconfirmedReading: { observed: doubt, advice: "observe the quantity after the press" } }, 3);
  const said = (last = after, kept = true) => automationStudioFlowBootstrapNotFinished({ judgement: last, checklist: items, rounds: 4, decisions: 60, stoodStill: { kind: "no_progress", before, rounds: 2 }, kept }).message;

  it("says that the Flow was not judged to do what was asked once, with its step count", () => {
    const message = said();
    expect(message.match(/judged to (?:do|be) what you asked/gu)).toHaveLength(1);
    expect(message).toContain("6 of the 6 things you asked have a step that ran, or could run, when the Flow (16 steps) was run from its start, but the Flow was not judged to do what you asked.");
    expect(message).not.toContain("The Flow (16 steps) ran from its start");
  });

  it("says the judge's doubt, bounded, as one check the other did not confirm", () => {
    const message = said();
    expect(message).toContain(`What the judge doubted, in one check the other did not confirm: "${doubt}".`);
    const long = round({ verdict: "unknown", findings: ["unsure"], unconfirmedReading: { observed: "x ".repeat(400) } }, 3);
    expect(said(long)).toMatch(/doubted, in one check the other did not confirm: "(?:x ){90,}x?\.\.\."\./u);
    const adviceOnly = round({ verdict: "unknown", findings: ["unsure"], unconfirmedReading: { advice: "observe the quantity" } }, 3);
    expect(said(adviceOnly)).toContain('What one check of the judge says is left to change, which the other did not confirm: "observe the quantity".');
    const none = round({ verdict: "unknown", findings: ["unsure"] }, 3);
    expect(said(none)).not.toContain("did not confirm:");
  });

  // One owner of the ending's words (t264 S3): lane B's account of the pair and
  // the doubt, said in lane D's plain words (t195-w48), the counts in `tried`.
  it("keeps every fact it carried in plain words: what stood still, the attempts, and the draft kept once", () => {
    const ended = automationStudioFlowBootstrapNotFinished({ judgement: after, checklist: items, rounds: 4, decisions: 60, stoodStill: { kind: "no_progress", before, rounds: 2 }, kept: true });
    const message = ended.message;
    expect(message).toMatch(/^I have not finished this Flow yet\. My last 2 attempts to fix it each got no further than the one before: 6 of the 6 things you asked have a step, no more than before, and the judge no longer agreed it was wrong, as one of its two checks said it does what you asked\. What the judge doubted, in one check the other did not confirm: "/u);
    expect(message).toContain("I worked on it live 4 times: first exploring the page, then fixing it 3 times after testing what I had.");
    expect(message).not.toMatch(/decision|\bmodel\b|\bround\b|measurable|as before\)|handed back/iu);
    expect(ended.tried).toMatchObject({ rounds: 4, decisions: 60 });
    expect(message.split("carries on from them")).toHaveLength(2);
    expect(message).not.toContain("What is left");
  });
});

// t195-w48: runs `run-musr9pv3-f4bf6256` and `run-musp474o-e0ed7432` showed the
// person a debug log -- "decisions", "the model", "round", "no measurable
// progress", "(1, as before)", "over 73 decisions". The ending reads as a chat
// answer; the counts stay in `tried`.
describe("the not-finished ending as a person reads it", () => {
  const internal = /decision|\bmodel\b|\bround\b|measurable|as before\)|handed back/iu;
  const one = [act("a1", "confirm everyone I have at least five mutual friends with")];
  const clean = { tested: "replayed_clean" as const, testIssueCodes: [], failedSteps: [], stepsInFlow: 7, proven: 1 };

  it("says run musr9pv3's ending plainly: the same Flow back, nothing more done", () => {
    const before = judgement({ round: 0, ...clean });
    const after = judgement({ ...clean });
    const said = automationStudioFlowBootstrapNotFinished({ judgement: after, checklist: one, rounds: 2, decisions: 73, stoodStill: { kind: "no_progress", before, rounds: 1 }, kept: true });
    expect(said.message).not.toMatch(internal);
    expect(said.message).toMatch(/^I have not finished this Flow yet\. My last attempt to fix it got no further than the one before: the Flow came out exactly the same, the one thing you asked has a step as it did before, and no more of its steps worked when it was run from the start\. /u);
    expect(said.message).toContain("I worked on it live twice: first exploring the page, then fixing it once after testing what I had.");
    expect(said.message).toContain("building again carries on from them");
    expect(said.tried).toMatchObject({ rounds: 2, decisions: 73 });
  });

  it("says run musp474o's ending plainly: it stopped short where the attempt before had got further", () => {
    const before = judgement({ round: 1, ...clean, flowSignature: "earlier", judge: { verdict: "unknown", findings: [] } });
    const after = judgement({ round: 2, ...clean });
    const said = automationStudioFlowBootstrapNotFinished({ judgement: after, checklist: one, rounds: 3, decisions: 39, stoodStill: { kind: "no_progress", before, rounds: 1 }, kept: true });
    expect(said.message).not.toMatch(internal);
    expect(said.message).toContain("My last attempt to fix it got no further than the one before: the one thing you asked has a step as it did before, and it stopped before the Flow was ready, though the attempt before it had got that far.");
    expect(said.message).toContain("I worked on it live 3 times: first exploring the page, then fixing it twice after testing what I had.");
    expect(said.tried).toMatchObject({ rounds: 3, decisions: 39 });
  });
});
