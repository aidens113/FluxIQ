// What the amendment handler tells the model about a refused amendment: every
// refusal names its way out, in the draft's own numbers
// (`../../draft-amendment-feedback.ts`, told by `../amendment.ts`).
//
// Split from `../../tests/draft-amendment-feedback.test.ts`, which is at the
// line limit, for the two t287 causes: run `run-mustvzvg-99695308` C4 (an
// unchanged rerun of a step that did not work was told its result stands) and
// W2 (refusal churn: refusals that named no way out were resent).

import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftAmendmentRefusal } from "../../../flow-draft/index.ts";
import { automationStudioLlmEvidenceDraftAmendmentFeedback } from "../../index.ts";

// t174-w108 Cause 6 (`run-musp8nz1-dbd3905a`, steps 0027-0028): with steps 1-13
// in the draft the model sent `{step 14, add, act a1}` for an Add to cart press
// it had not run yet. It was told `no_such_step` and the positions, but no
// `next`: a step enters the draft by running, so the number after the last is
// the one a run with add true would take.
describe("a refusal naming the next free number says to run the step first", () => {
  const steps = [{ position: 1 }, { position: 2 }, { position: 3 }];
  const told = (step: number, on = steps) => automationStudioLlmEvidenceDraftAmendmentFeedback({
    refusals: [{ step, reason: "no_such_step" }], applied: 0, steps: on, stepsWithoutProgress: 1, maxStepsWithoutProgress: 8
  });

  it("says step 4 of three is not there until it runs, and to run it with add true", () => {
    const feedback = told(4);
    const next = (feedback.refused as { next?: string }[])[0]?.next;
    expect(next).toBe("There is no step 4 yet: a step enters the draft only by running. Run that action first as a call with add true (and its act, if it does one), and it becomes step 4; do not amend it before it has run.");
    expect(feedback.positions).toEqual([1, 2, 3]);
    expect(feedback.instruction).toContain("next, beside a refusal, is what to do instead");
    expect((told(1, []).refused as { next?: string }[])[0]?.next).toContain("it becomes step 1");
  });

  // W2: a number past the next free one, or a gap inside the draft, used to get no next.
  it("names the positions to choose from for a number past the next free one, or one inside the draft", () => {
    expect((told(9).refused as { next?: string }[])[0]?.next).toBe("There is no step 9 in the draft: name a step listed under positions, as the draft shows it, or run the step you meant as a new call with add true.");
    expect((told(2, [{ position: 1 }, { position: 3 }]).refused as { next?: string }[])[0]?.next).toContain("There is no step 2 in the draft");
    // The step named exists: the missing number was its check, to or over.
    expect((told(2).refused as { next?: string }[])[0]?.next).toContain("Step 2 is in the draft, but the step its check, to or over named is not");
  });

  // Merged with run musp4h2f's rule that every refusal names the acts still to
  // do: the run-first `next` comes first, then the checklist, when there is one.
  it("ends with the acts the checklist still shows not done, and names only those for any other number", () => {
    const withChecklist = (step: number) => (automationStudioLlmEvidenceDraftAmendmentFeedback({
      refusals: [{ step, reason: "no_such_step" }], applied: 0, steps, stepsWithoutProgress: 1, maxStepsWithoutProgress: 8, actsNotDone: ["a1"]
    }).refused as { next?: string }[])[0]?.next;
    expect(withChecklist(4)).toBe("There is no step 4 yet: a step enters the draft only by running. Run that action first as a call with add true (and its act, if it does one), and it becomes step 4; do not amend it before it has run. Still not done on the checklist: a1. Go on with those.");
    expect(withChecklist(9)).toBe("There is no step 9 in the draft: name a step listed under positions, as the draft shows it, or run the step you meant as a new call with add true. Still not done on the checklist: a1. Go on with those.");
  });
});

type FeedbackInput = Parameters<typeof automationStudioLlmEvidenceDraftAmendmentFeedback>[0];
type Reason = AutomationStudioFlowDraftAmendmentRefusal["reason"];
const firstNext = (feedback: Record<string, unknown>): string | undefined => (feedback.refused as { next?: string }[])[0]?.next;

// Live run `run-mustvzvg-99695308` (C4, 0065-0077): the read rerun as step 8
// was refused `malformed_handle` and never ran. Four identical reruns of it
// were each refused `changes_nothing` in words for a read that ran -- "its
// result stands as shown ... go on to the act" -- and the model resent them
// verbatim until the round stalled.
describe("run mustvzvg C4: an unchanged rerun of a step that did not work", () => {
  const nav = { position: 1, effect: "mutate", effectApplied: true, disposition: "kept" };
  const read = { position: 7, effect: "observe", proposes: true, effectApplied: true, disposition: "kept" };
  const refusedRead = { position: 8, effect: "observe", proposes: true, effectApplied: false, disposition: "taken", resultCode: "target_unobserved", resultReason: "malformed_handle", callId: "d16" };
  const told = (steps: FeedbackInput["steps"], actsNotDone?: string[]) => automationStudioLlmEvidenceDraftAmendmentFeedback({
    refusals: [{ step: 8, reason: "changes_nothing", repeated: true }], applied: 0, steps, stepsWithoutProgress: 5, maxStepsWithoutProgress: 8, ...(actsNotDone ? { actsNotDone } : {})
  });

  it("says the exact call was refused before and would be refused again, names its code, and says what to change", () => {
    const next = firstNext(told([nav, read, refusedRead]));
    expect(next).toContain("Step 8 did not work");
    expect(next).toContain("this exact call was refused before (target_unobserved, malformed_handle) and would be refused again");
    expect(next).toContain("its result under call d16");
    expect(next).toContain(`{"step": 8, "change": "rerun", "input": {`);
    expect(next).toContain("null removes");
    expect(next).toContain("gather new evidence");
    for (const claim of ["go on to the act", "intended rows", "result stands", "repeat"]) expect(next).not.toContain(claim);
  });

  it("says the same of a press that did not work, naming no code where the step carries none", () => {
    const next = firstNext(told([nav, read, { position: 8, effect: "mutate", effectApplied: false, disposition: "kept" }]));
    expect(next).toContain("Step 8 did not work: this exact call was refused before and would be refused again");
    expect(next).toContain("Read what its result names as refused");
  });

  it("ends with the acts the checklist still shows not done", () => {
    expect(firstNext(told([nav, read, refusedRead], ["a1"]))).toMatch(/Still not done on the checklist: a1\. Go on with those\.$/u);
  });

  it("keeps the read-that-ran wording for a read that worked, and never calls a written or checked step failed", () => {
    const ran = firstNext(told([nav, read, { ...refusedRead, effectApplied: true }]));
    expect(ran).toContain("Step 8's identical request was not sent again");
    expect(ran).toContain("intended rows");
    expect(firstNext(told([nav, read, { ...refusedRead, written: true }]))).not.toContain("did not work");
    expect(firstNext(told([nav, read, { ...refusedRead, checkedCandidate: { callId: "c1", code: "ok" } }]))).not.toContain("did not work");
  });

  it("quotes only code-shaped words from the step, never a value that could be a page's", () => {
    const next = firstNext(told([nav, read, { ...refusedRead, resultCode: "Price: $49.99 <b>", resultReason: "a b c", callId: "x y" }]));
    expect(next).toContain("would be refused again");
    for (const leaked of ["$49.99", "a b c", "x y"]) expect(next).not.toContain(leaked);
  });

  it("says it in the reason too", () => {
    const reason = (told([nav, read, refusedRead]).reasons as Record<string, string>).changes_nothing;
    expect(reason).toContain("did_not_work");
    expect(reason).toContain("would be refused again");
  });
});

// W2 (week review, causes-late): refusal churn. A refusal that names no way
// out is resent; many reasons got a next only with a checklist, `no_such_step`
// only for the next free number, and `already_in_flow`, `already_so`,
// `no_such_position`, `run_by_the_loop`, `no_step_before_it`, `not_a_kept_step`,
// `did_not_work`, `act_on_a_read`, `bind_*` and `rerun_holds_binding` often none.
describe("W2: every amendment refusal names its way out, in the draft's numbers", () => {
  const steps = [
    { position: 1, effect: "mutate", effectApplied: true, disposition: "kept" },
    { position: 2, effect: "observe", proposes: true, effectApplied: true, disposition: "kept" },
    { position: 3, effect: "mutate", effectApplied: true, disposition: "kept" },
    { position: 4, effect: "observe", proposes: false, effectApplied: false, disposition: "taken" },
    { position: 5, effect: "mutate", effectApplied: true, disposition: "dropped" }
  ];
  const told = (refusal: AutomationStudioFlowDraftAmendmentRefusal, actsNotDone?: string[], on: FeedbackInput["steps"] = steps) => firstNext(automationStudioLlmEvidenceDraftAmendmentFeedback({
    refusals: [refusal], applied: 0, steps: on, stepsWithoutProgress: 1, maxStepsWithoutProgress: 8, ...(actsNotDone ? { actsNotDone } : {})
  }));
  // Exhaustive by type, as above: a new reason fails to compile until it is given its way out here.
  const extra: Record<Reason, Partial<AutomationStudioFlowDraftAmendmentRefusal>> = {
    no_such_step: {}, already_so: {}, no_such_position: {}, run_by_the_loop: {}, no_step_before_it: {}, over_not_before: { over: 2 }, not_a_kept_step: {},
    did_not_work: {}, already_in_flow: {}, already_out: {}, changes_nothing: {}, act_on_a_read: {}, act_already_named: { act: "a1" },
    bind_not_a_binding: { parameter: "query" }, bind_new_key: { parameter: "query", bindable: ["text"] }, bind_row_outside_loop: { parameter: "query" }, bind_malformed: { parameter: "query" },
    rerun_holds_binding: {}, repeat_taken_off: { over: 3, takenOff: "over_after" }, strands_a_step: { strands: 3 }, settings_rewrite_run: {}, second_copy: { copyOf: 1 }
  };

  it("gives every reason a next naming the step, without a checklist and with one", () => {
    for (const [reason, more] of Object.entries(extra) as [Reason, Partial<AutomationStudioFlowDraftAmendmentRefusal>][]) {
      const bare = told({ step: 2, reason, ...more });
      expect(bare, reason).toMatch(/\b[Ss]tep 2\b|"step": 2\b/u);
      expect(bare, reason).not.toContain("checklist");
      const listed = told({ step: 2, reason, ...more }, ["a5"]);
      expect(listed, reason).toMatch(/\b[Ss]tep 2\b|"step": 2\b/u);
      expect(listed, reason).toMatch(/Still not done on the checklist: a5\. Go on with those\.$/u);
    }
  });

  it("names the amendment or call to send instead", () => {
    expect(told({ step: 2, reason: "run_by_the_loop" })).toContain(`{"step": 2, "change": "rerun", "input": {`);
    expect(told({ step: 2, reason: "no_such_position" })).toContain(`{"step": 2, "change": "reorder", "to": <a step from 1 to 5>}`);
    expect(told({ step: 2, reason: "no_step_before_it" })).toContain(`{"step": 2, "change": "only_if", "check": <that step>}`);
    expect(told({ step: 2, reason: "already_so" })).toContain("Step 2 already says that");
    expect(told({ step: 3, reason: "already_in_flow" })).toContain("Run what the Flow still lacks as a new call with add true, or complete");
    expect(told({ step: 5, reason: "already_out" })).toContain(`{"step": 5, "change": "add"}`);
    expect(told({ step: 3, reason: "did_not_work" })).toContain(`{"step": 3, "change": "rerun", "input": {`);
    expect(told({ step: 3, reason: "did_not_work" }, undefined, [{ position: 3, effect: "mutate", effectApplied: false, disposition: "kept", callId: "call.3" }])).toContain("its result under call call.3");
    expect(told({ step: 2, reason: "rerun_holds_binding" })).toContain("write true");
    expect(told({ step: 2, reason: "bind_new_key", parameter: "query", bindable: ["text", "where.price"] })).toContain("bind one of text, where.price on step 2 instead");
    expect(told({ step: 2, reason: "bind_new_key", parameter: "query" })).toContain("Step 2 has no value to bind at query");
    expect(told({ step: 2, reason: "bind_not_a_binding", parameter: "query" })).toContain(`query set to {"$input": <name>, "test": <its value>}`);
    expect(told({ step: 2, reason: "bind_row_outside_loop", parameter: "query" })).toContain(`{"step": 2, "change": "repeat", "over": <the listing>}`);
    expect(told({ step: 2, reason: "repeat_taken_off" })).toContain(`{"step": 2, "change": "repeat", "over": <the listing>}`);
    expect(told({ step: 2, reason: "strands_a_step" })).toContain("Step 2 stays in the Flow");
    expect(told({ step: 2, reason: "settings_rewrite_run" })).toContain("Step 2 keeps what it ran with");
    expect(told({ step: 2, reason: "settings_rewrite_run" })).toContain(`{"step": 2, "change": "rerun", "input": {`);
  });

  it("tells a step that is not in the Flow apart from a look, and from a routed step that is not", () => {
    expect(told({ step: 4, reason: "not_a_kept_step" })).toContain("Step 4 only looked");
    expect(told({ step: 5, reason: "not_a_kept_step" })).toContain(`{"step": 5, "change": "add"}`);
    expect(told({ step: 3, reason: "not_a_kept_step" })).toContain("Step 3 is in the Flow, but the step its check, to, over or through named is not");
  });

  it("names the press after a read an act was put on, or says to run one", () => {
    expect(told({ step: 2, reason: "act_on_a_read" })).toContain(`{"step": 3, "change": "keep", "act": <the act>}`);
    const taken = [steps[0]!, steps[1]!, { position: 3, effect: "mutate", effectApplied: true, disposition: "taken" }];
    expect(told({ step: 2, reason: "act_on_a_read" }, undefined, taken)).toContain(`{"step": 3, "change": "add", "act": <the act>}`);
    expect(told({ step: 2, reason: "act_on_a_read" }, undefined, steps.slice(0, 2))).toContain("No step after step 2 does an act yet");
  });
});
