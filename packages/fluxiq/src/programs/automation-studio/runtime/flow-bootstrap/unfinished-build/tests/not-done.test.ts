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
  automationStudioFlowBootstrapProgressSaid,
  automationStudioFlowBootstrapRepairingJudgedSaid,
  automationStudioFlowBootstrapStopSaid,
  automationStudioFlowBootstrapTestSaid
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
    expect(said).toBe("too many of its decisions in a row could not be used");
    expect(said).not.toContain("finish");
  });

  it("says which kind of decision it was when the issues are known", () => {
    expect(automationStudioFlowBootstrapStopSaid("unusable_decisions", ["llm_evidence_loop.draft_amendments_refused"]))
      .toBe("too many of its decisions in a row could not be used, because the model kept asking for changes to the Flow that changed nothing");
    expect(automationStudioFlowBootstrapStopSaid("unusable_decisions", ["llm_evidence_loop.repeat_refused"]))
      .toBe("too many of its decisions in a row could not be used, because the model kept trying again what had already failed or changed nothing");
    expect(automationStudioFlowBootstrapStopSaid("unusable_decisions", ["bootstrap.instructed_act_missing"]))
      .toBe("too many of its decisions in a row could not be used, because the Flow did not yet do what you asked");
    // An issue with no words of its own adds nothing, and other stops are said as before.
    expect(automationStudioFlowBootstrapStopSaid("unusable_decisions", ["something.else"])).toBe("too many of its decisions in a row could not be used");
    expect(automationStudioFlowBootstrapStopSaid("iterations", ["llm_evidence_loop.draft_amendments_refused"])).toBe("it used every decision it had without the Flow being finished");
    expect(automationStudioFlowBootstrapStopSaid("budget")).toBe("a budget ran out");
  });

  it("puts refused amendments into words as what held a build up", () => {
    expect(automationStudioFlowBootstrapBlockedSaid(["llm_evidence_loop.draft_amendments_refused"])).toBe("the model kept asking for changes to the Flow that changed nothing");
    expect(automationStudioFlowBootstrapBlockedSaid(["llm_evidence_loop.draft_amendment_undone"])).toBe("the model kept asking for changes to the Flow that changed nothing");
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

  it("calls worked only what worked when the Flow was run, and says the rest did not", () => {
    expect(automationStudioFlowBootstrapProgressSaid(checklist, { tested: "replay_failed", proven: 1 })).toBe("1 of the 4 things you asked worked when the Flow was run from its start, and 2 more have a step that did not work in that run; still to do: \"two packs\": nothing I tried did it.");
    expect(automationStudioFlowBootstrapProgressSaid(checklist, { tested: "replayed_clean", proven: 3 })).toMatch(/^3 of the 4 things you asked worked when the Flow was run from its start; still to do/u);
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
