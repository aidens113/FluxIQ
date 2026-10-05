// What the person reads about acts not done and the last test (live run 36,
// `run-muq3uozx-3153564b`): the ending said "the step I tried for it changed
// nothing" of a list read named for confirming people, and that the Flow "ran
// from its start without failing" while every completion had been refused for
// its act.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { automationStudioInstructedActsChecklist } from "../../instructed-acts/index.ts";
import type { AutomationStudioFlowBootstrapJudgement } from "../contracts.ts";
import { automationStudioFlowBootstrapJudgeUnfinished } from "../judgement.ts";
import {
  automationStudioFlowBootstrapBlockedSaid,
  automationStudioFlowBootstrapNotDone,
  automationStudioFlowBootstrapNotDoneSaid,
  automationStudioFlowBootstrapProgressAndTestSaid,
  automationStudioFlowBootstrapProgressSaid,
  automationStudioFlowBootstrapRepairingJudgedSaid,
  automationStudioFlowBootstrapStopSaid,
  automationStudioFlowBootstrapTestSaid,
  automationStudioFlowBootstrapUnsettledForBuild
} from "../not-done.ts";

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

  // The checklist's reasons read from what a step acted on and how many times
  // (`../../instructed-acts/act-object.ts`, `quantity-fault.ts`) each have a
  // clause of their own; they used to fall back to "nothing I tried did it".
  it.each([
    ["step_acts_on_another_object", "the step I named for it acted on a different item from the one you asked for"],
    ["quantity_is_a_repeat", "the step for how many ran once for each item of a list, not that many times on this item"],
    ["quantity_presses_differ", "the step for how many did not add it exactly the number of times you asked"]
  ])("says %s in plain words of its own", (todo, words) => {
    const said = automationStudioFlowBootstrapNotDoneSaid([{ id: "a1.quantity", quote: "two packs", todo }]);
    expect(said).toBe(`"two packs": ${words}`);
    expect(said).not.toContain("nothing I tried did it");
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

// Live run `run-muqiojz4-04a7a8fc` (t193, bigbox) stalled on five amendments
// refused in a row and was told "every attempt to finish was refused", though
// it never tried to finish.
describe("what the person is told stopped the build", () => {
  it("claims no attempt to finish for a run of unusable decisions", () => {
    const said = automationStudioFlowBootstrapStopSaid("unusable_decisions");
    expect(said).toBe("too many attempts in a row went nowhere");
    expect(said).not.toContain("finish");
  });

  it("says which kind of decision it was when the issues are known", () => {
    expect(automationStudioFlowBootstrapStopSaid("unusable_decisions", ["llm_evidence_loop.draft_amendments_refused"]))
      .toBe("too many attempts in a row went nowhere, because it kept trying changes to the Flow that changed nothing");
    expect(automationStudioFlowBootstrapStopSaid("unusable_decisions", ["llm_evidence_loop.repeat_refused"]))
      .toBe("too many attempts in a row went nowhere, because it kept retrying things that had already failed or done nothing");
    expect(automationStudioFlowBootstrapStopSaid("unusable_decisions", ["bootstrap.instructed_act_missing"]))
      .toBe("too many attempts in a row went nowhere, because the Flow did not yet do what you asked");
    // An issue with no words of its own adds nothing, and other stops are said as before.
    expect(automationStudioFlowBootstrapStopSaid("unusable_decisions", ["something.else"])).toBe("too many attempts in a row went nowhere");
    expect(automationStudioFlowBootstrapStopSaid("iterations", ["llm_evidence_loop.draft_amendments_refused"])).toBe("it used all the tries it had before the Flow was finished");
    expect(automationStudioFlowBootstrapStopSaid("budget")).toBe("a budget ran out");
  });

  it("puts refused amendments into words as what held a build up", () => {
    expect(automationStudioFlowBootstrapBlockedSaid(["llm_evidence_loop.draft_amendments_refused"])).toBe("it kept trying changes to the Flow that changed nothing");
    expect(automationStudioFlowBootstrapBlockedSaid(["llm_evidence_loop.draft_amendment_undone"])).toBe("it kept trying changes to the Flow that changed nothing");
  });
});

// Runs 36 and 38 (t193, bigbox) ended "6 of the 6 things you asked are done" and
// "5 of the 6" with one item in the cart: each claim stood on a step named for
// it, some of them typing into a search field. What the ending calls worked is
// now what worked when the Flow was run from its start.
describe("how much of what was asked the ending says is done", () => {
  const checklist = [
    { id: "a1", verb: "switch", quote: "switch my store", done: 1 },
    { id: "a2", verb: "add", quote: "add the towels", done: 2, choices: [{ id: "a2.quantity", choice: "quantity" as const, value: "two", quote: "two packs" }] },
    { id: "a3", verb: "add", quote: "add the napkins", done: 3 }
  ];

  it("says a named step is not yet shown to work when nothing was run", () => {
    expect(automationStudioFlowBootstrapProgressSaid(checklist, { tested: "not_tested" })).toBe("3 of the 4 things you asked have a step in the Flow, not yet shown to work by running it; still to do: \"two packs\": nothing I tried did it.");
    expect(automationStudioFlowBootstrapProgressSaid(checklist, undefined)).toMatch(/^3 of the 4 things you asked have a step in the Flow, not yet shown/u);
  });

  it("says which steps ran when the Flow was run, and that the rest did not, without calling them worked unjudged", () => {
    expect(automationStudioFlowBootstrapProgressSaid(checklist, { tested: "replay_failed", proven: 1 })).toBe("1 of the 4 things you asked has a step that ran, or could run, when the Flow was run from its start, and 2 more have a step that did not work in that run; still to do: \"two packs\": nothing I tried did it.");
    expect(automationStudioFlowBootstrapProgressSaid(checklist, { tested: "replayed_clean", proven: 3 })).toMatch(/^3 of the 4 things you asked have a step that ran, or could run, when the Flow was run from its start; still to do/u);
  });

  // t193 R2-C3 (`run-murzln6g-11debe1d`): "5 of the 6 things you asked worked when
  // the Flow was run from its start", then "what it did was judged not to be what
  // you asked". A proven step may only have been checked, not done
  // (`../../../flow-draft/verify-only.ts`), and the judge said the whole was wrong.
  it("never says worked after the Flow was judged not to do what was asked", () => {
    const said = automationStudioFlowBootstrapProgressSaid(checklist, { tested: "replayed_clean", proven: 3, judge: { verdict: "no" } });
    expect(said).not.toContain("worked");
    expect(said).toBe("3 of the 4 things you asked have a step that ran, or could run, when the Flow was run from its start, but the Flow was judged not to do what you asked; still to do: \"two packs\": nothing I tried did it.");
    expect(automationStudioFlowBootstrapProgressSaid(checklist, { tested: "replayed_clean", proven: 3, judge: { verdict: "not_judged" } }))
      .toMatch(/^3 of the 4 things you asked have a step that ran, or could run, when the Flow was run from its start, but the Flow was not judged to do what you asked; still to do/u);
  });

  it("says worked where the Flow was judged to do what was asked", () => {
    expect(automationStudioFlowBootstrapProgressSaid(checklist, { tested: "replayed_clean", proven: 3, judge: { verdict: "yes" } }))
      .toMatch(/^3 of the 4 things you asked worked when the Flow was run from its start; still to do/u);
  });

  // Live run `run-murz83zy-5030820f` asked one thing and was told "1 of the 1
  // things you asked worked when the Flow was run from its start".
  it("says the one thing asked as one thing, never \"1 of the 1 things\"", () => {
    const one = [{ id: "a1", verb: "confirm", quote: "confirm everyone with five mutual friends", done: 1 }];
    // "Worked" needs the judge's yes (lane B's R2-C3, merged with t195-w37 on 2026-10-03).
    expect(automationStudioFlowBootstrapProgressSaid(one, { tested: "replayed_clean", proven: 1, judge: { verdict: "yes" } })).toBe("The one thing you asked worked when the Flow was run from its start.");
    expect(automationStudioFlowBootstrapProgressSaid(one, { tested: "replayed_clean", proven: 1 })).toBe("The one thing you asked has a step that ran, or could run, when the Flow was run from its start.");
    expect(automationStudioFlowBootstrapProgressSaid(one, { tested: "replayed_clean", proven: 1, judge: { verdict: "no" } })).toBe("The one thing you asked has a step that ran, or could run, when the Flow was run from its start, but the Flow was judged not to do what you asked.");
    expect(automationStudioFlowBootstrapProgressSaid(one, { tested: "replay_failed", proven: 0 })).toBe("The one thing you asked has a step that did not work when the Flow was run from its start.");
    expect(automationStudioFlowBootstrapProgressSaid(one, { tested: "not_tested" })).toBe("The one thing you asked has a step in the Flow, not yet shown to work by running it.");
  });

  it("says none is done when no step is named, and nothing when nothing was asked", () => {
    expect(automationStudioFlowBootstrapProgressSaid([{ id: "a1", verb: "add", quote: "add the towels" }], { tested: "replayed_clean", proven: 0 })).toBe("The one thing you asked is not done; still to do: \"add the towels\": nothing I tried did it.");
    expect(automationStudioFlowBootstrapProgressSaid(undefined, undefined)).toBe("");
  });

  it("the judgement counts as proven only the acts and choices whose step worked when it ran the Flow", async () => {
    const judged = await automationStudioFlowBootstrapJudgeUnfinished({
      round: 0, stopped: "unusable_decisions", lastIssueCodes: [],
      steps: [step(1), step(2), step(3)],
      replayable: () => true,
      // Step 1 works, step 2 fails, and step 3 is never reached.
      test: async (seed) => {
        seed[0]!.replayed = { step: 1, actionId: "web.dom.click", status: "replayed" };
        seed[1]!.replayed = { step: 2, actionId: "web.dom.click", status: "failed" };
        return { issueCodes: ["core.replay.failed"] };
      },
      checklist: () => checklist
    });
    if (judged.kind !== "judged") throw new Error("not judged");
    expect(judged.judgement).toMatchObject({ tested: "replay_failed", done: 3, proven: 1 });
    const untested = await automationStudioFlowBootstrapJudgeUnfinished({ round: 0, stopped: "budget", lastIssueCodes: [], steps: [step(1)], replayable: () => true, checklist: () => checklist });
    if (untested.kind !== "judged") throw new Error("not judged");
    expect(untested.judgement.proven).toBeUndefined();
  });
});

// Run `run-murwd8le-79e735a8` (UI review D3, screenshot 00010): under a card
// saying the result was unverified, the person read "The Flow was not judged to
// do what you asked: The two checks of this result disagreed...".
describe("the repair's heading after a judge that did not confirm the Flow", () => {
  const disagreed = "This result was checked twice with the same evidence, and the answers differed: the first was that it does not do what was asked, the second that it does. Neither answer counts for more than the other, so the result is not confirmed, and the run is not marked as failed for it.";

  it("says the Flow is not yet confirmed, in the words of the card above it, and what it does next", () => {
    const said = automationStudioFlowBootstrapRepairingJudgedSaid({ verdict: "unknown", findings: [disagreed] });
    expect(said).toBe("The Flow is not yet confirmed to do what you asked: This result was checked twice with the same evidence, and the answers differed: the first was that it does not do what was asked, the second that it does. Repairing it live, to test it from its start and check it again.");
    expect(said).not.toMatch(/model|status its steps earned|two checks|not judged/iu);
  });

  it("still says a refuted Flow was judged not to do it", () => {
    expect(automationStudioFlowBootstrapRepairingJudgedSaid({ verdict: "no", observed: "the cart holds one", findings: [] })).toBe("The Flow was tested from its start and judged not to do what you asked: the cart holds one. Repairing it live.");
  });
});

// Live run `run-musp4h2f-72e8ed99` (t193 round 1003): "6 of the 6 things you
// asked have a step that ran, or could run, ..., but the Flow was not judged to
// do what you asked. The Flow (16 steps) ran from its start, but what it did was
// not judged to be what you asked." The same point, said twice.
describe("how much was done and the last test, said together", () => {
  const six = Array.from({ length: 6 }, (_, index) => ({ id: `a${index + 1}`, verb: "add", quote: `thing ${index + 1}`, done: index + 1 }));

  it("says the step count inside the progress sentence and the judged clause once", () => {
    for (const verdict of ["unknown", "no"] as const) {
      const said = automationStudioFlowBootstrapProgressAndTestSaid(six, judgement({ stepsInFlow: 16, done: 6, proven: 6, todo: [], judge: { verdict, findings: [] } }));
      expect(said).toContain("6 of the 6 things you asked have a step that ran, or could run, when the Flow (16 steps) was run from its start, but the Flow was");
      expect(said.match(/judged/gu)).toHaveLength(1);
      expect(said).not.toContain("ran from its start, but what it did");
    }
  });

  it("keeps both sentences when the test says something the progress does not", () => {
    const carried = judgement({ stepsInFlow: 16, done: 6, proven: 6, todo: [], judge: { verdict: "unknown", findings: [], untestedCarried: [3] } });
    expect(automationStudioFlowBootstrapProgressAndTestSaid(six, carried)).toBe(`${automationStudioFlowBootstrapProgressSaid(six, carried)} ${automationStudioFlowBootstrapTestSaid(carried)}`);
    const unjudged = judgement({ stepsInFlow: 16, done: 6, proven: 6, todo: [] });
    expect(automationStudioFlowBootstrapProgressAndTestSaid(six, unjudged)).toBe(`${automationStudioFlowBootstrapProgressSaid(six, unjudged)} ${automationStudioFlowBootstrapTestSaid(unjudged)}`);
    expect(automationStudioFlowBootstrapProgressAndTestSaid([], unjudged)).toBe(automationStudioFlowBootstrapTestSaid(unjudged));
  });
});

// t193 round 1003 (w6 D10 note): a split judge's closing sentence is the run's
// ("the run is not marked as failed for it"); a build says what it means there.
describe("a split judge's reason, as a build says it", () => {
  it("swaps each run sentence for the build's and leaves any other reason as it was", () => {
    const disagreed = "The answers differed. Neither answer counts for more than the other, so the result is not confirmed, and the run is not marked as failed for it.";
    const unconfirmed = "One said no. That does not show the run went wrong, so the result is not confirmed, and the run is not marked as failed for it.";
    expect(automationStudioFlowBootstrapUnsettledForBuild(disagreed)).toBe("The answers differed. Since they disagree, the build cannot finish on this test.");
    expect(automationStudioFlowBootstrapUnsettledForBuild(unconfirmed)).toBe("One said no. Since neither confirmed it, the build cannot finish on this test.");
    expect(automationStudioFlowBootstrapUnsettledForBuild("the cart holds one pack")).toBe("the cart holds one pack");
  });

  it("is what the repair heading says of a short split reason", () => {
    const said = automationStudioFlowBootstrapRepairingJudgedSaid({ verdict: "unknown", findings: ["The answers differed. Neither answer counts for more than the other, so the result is not confirmed, and the run is not marked as failed for it."] });
    expect(said).not.toContain("not marked as failed");
  });
});

// t195-w48: the chat's "The build stopped before the Flow was finished: ..." read
// "too many of its decisions in a row could not be used, because the model kept
// asking for changes to the Flow that changed nothing" (run-musr9pv3-f4bf6256).
describe("the stop as a person reads it", () => {
  const internal = /decision|\bmodel\b|\bround\b|measurable/iu;
  it("names no internals for either live run's stop", () => {
    expect(automationStudioFlowBootstrapStopSaid("unusable_decisions", ["llm_evidence_loop.draft_amendments_refused"]))
      .toBe("too many attempts in a row went nowhere, because it kept trying changes to the Flow that changed nothing");
    expect(automationStudioFlowBootstrapStopSaid("unusable_decisions", ["llm_evidence_loop.repeat_refused"]))
      .toBe("too many attempts in a row went nowhere, because it kept retrying things that had already failed or done nothing");
    for (const stop of ["iterations", "tool_calls", "unusable_decisions", "repeat_without_progress", "judged_wrong"] as const) {
      expect(automationStudioFlowBootstrapStopSaid(stop)).not.toMatch(internal);
    }
    for (const code of ["llm_output.bad", "llm_evidence_loop.already_answered", "llm_evidence_loop.draft_amendment_undone", "llm_evidence_loop.repeat_refused"]) {
      expect(automationStudioFlowBootstrapBlockedSaid([code])).not.toMatch(internal);
    }
  });
});
