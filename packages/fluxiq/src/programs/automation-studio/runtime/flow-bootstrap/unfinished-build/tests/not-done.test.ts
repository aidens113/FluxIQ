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
import { automationStudioFlowBootstrapNotDone, automationStudioFlowBootstrapNotDoneSaid, automationStudioFlowBootstrapProgressSaid, automationStudioFlowBootstrapTestSaid } from "../not-done.ts";

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
