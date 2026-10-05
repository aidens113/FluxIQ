import { describe, expect, it } from "vitest";
import { ACTIVITY_ACTION_NAMES, ACTIVITY_ACTION_REFUSAL_WORDS, activityActionOf, type ActivityActionEvent } from "../index.ts";
import { activityActionRecordOf } from "../record.ts";
import { activityActionRefusal } from "../refusal.ts";

// t193 1003 (`run-musp4h2f-72e8ed99`, UI review D2-D4, C13/C14): an edit Core refused, and a
// call refused as a repeat before it ran, were a bold header with prose ending "so this was
// not done: <the model's summary>", and no card. Each is now a card under its decision, read
// here from Core's answer: what was asked, "Not done", and Core's plain reason.

const edit = (text: string | undefined, status: "succeeded" | "failed" = "failed"): ActivityActionEvent => ({
  phase: "building",
  detail: { kind: "tool", title: "Editing the Flow", status, ref: "core.flow_draft", ...(text === undefined ? {} : { text }) }
});

describe("activityActionRecordOf: how many of an edit's changes landed", () => {
  it("reads the count an edit's card carries, and nothing that is not one", () => {
    expect(activityActionRecordOf("Result: llm_evidence_loop.draft_amendments_refused · Reason: act_already_named,bind_new_key · Applied: 1").applied).toBe(1);
    expect(activityActionRecordOf("Result: llm_evidence_loop.draft_amendments_refused · Reason: already_in_flow").applied).toBeUndefined();
    expect(activityActionRecordOf("Applied: many").applied).toBeUndefined();
  });
});

describe("activityActionRefusal", () => {
  it("is nothing for a code that is no refusal of Core's", () => {
    expect(activityActionRefusal({ resultCode: "web.target.not_found", reason: "changed_nothing" })).toBeNull();
    expect(activityActionRefusal({ resultCode: undefined })).toBeNull();
  });

  it("says each reason of a refused edit in Core's words, at most two, never the code", () => {
    const refusal = activityActionRefusal({ resultCode: "llm_evidence_loop.draft_amendments_refused", reason: "already_in_flow,already_out,already_in_flow,act_already_named" });
    expect(refusal).toEqual({ all: true, rerun: false, because: "that step is already in the Flow; and that step is already out of the Flow" });
  });

  it("says an edit some of whose changes landed as done in part", () => {
    expect(activityActionRefusal({ resultCode: "llm_evidence_loop.draft_amendments_refused", reason: "bind_new_key", applied: 1 }))
      .toEqual({ all: false, rerun: false, because: "that step has no such value to make vary" });
  });

  it("says a step asked to run again, unchanged, as not run again, whichever check refused it", () => {
    for (const record of [
      { resultCode: "llm_evidence_loop.repeat_refused", reason: "changed_nothing" },
      { resultCode: "llm_evidence_loop.draft_amendments_refused", reason: "changes_nothing" },
      { resultCode: "llm_evidence_loop.draft_amendments_refused", reason: "rerun_holds_binding" }
    ]) {
      const refusal = activityActionRefusal(record);
      expect(refusal?.all).toBe(true);
      expect(refusal?.rerun).toBe(true);
    }
    expect(activityActionRefusal({ resultCode: "llm_evidence_loop.repeat_refused", reason: "changed_nothing" })?.because).toBe("it was already tried exactly this way and changed nothing");
  });

  it("says an edit that put the Flow back as it was, and a reason it has no words for, plainly", () => {
    expect(activityActionRefusal({ resultCode: "llm_evidence_loop.draft_amendment_undone" })?.because).toBe("the Flow would only be back as it was before");
    expect(activityActionRefusal({ resultCode: "llm_evidence_loop.draft_amendments_refused", reason: "some_new_reason" })?.because).toBe("the Flow is as it was");
    expect(activityActionRefusal({ resultCode: "llm_evidence_loop.draft_amendments_refused", applied: 2 })?.because).toBe("the rest of it changed nothing");
    expect(activityActionRefusal({ resultCode: "llm_evidence_loop.repeat_refused", reason: "some_new_outcome" })?.because).toBe("it was already tried exactly this way, and trying it again would end the same way");
  });

  it("has words for a refusal's every outcome, none of them a code", () => {
    for (const words of [...Object.values(ACTIVITY_ACTION_REFUSAL_WORDS.amendment), ...Object.values(ACTIVITY_ACTION_REFUSAL_WORDS.repeated)]) {
      expect(words).toMatch(/^[a-z]/u);
      expect(words).not.toMatch(/_/u);
    }
  });
});

describe("activityActionOf: a refused edit is a card", () => {
  it("names what was asked in Core's words, and says it was not done and why", () => {
    const action = activityActionOf(edit("Result: llm_evidence_loop.draft_amendments_refused · Reason: already_in_flow"));
    expect(action).toMatchObject({ kind: "draft", target: null, outcome: "failed", why: "that step is already in the Flow", refused: { all: true, because: "that step is already in the Flow" } });
    expect(ACTIVITY_ACTION_NAMES.draft).toBe("Edit the Flow");
  });

  it("names a step asked to run again as that", () => {
    const action = activityActionOf(edit("Result: llm_evidence_loop.repeat_refused · Reason: changed_nothing"));
    expect(action).toMatchObject({ kind: "draft", target: "run the step again", outcome: "failed", refused: { all: true } });
  });

  it("reads an edit done in part as done, with what was not, and never as a failure", () => {
    const action = activityActionOf(edit("Result: llm_evidence_loop.draft_amendments_refused · Reason: act_already_named · Applied: 2", "succeeded"));
    expect(action).toMatchObject({ kind: "draft", outcome: "done", why: null, refused: { all: false, because: "that step already does that" } });
  });

  it("reads an edit that landed as done, with nothing refused", () => {
    const action = activityActionOf(edit(undefined, "succeeded"));
    expect(action).toMatchObject({ kind: "draft", outcome: "done", why: null });
    expect(action?.refused).toBeUndefined();
  });
});

describe("activityActionOf: a call refused as a repeat is its own card", () => {
  it("keeps the call's kind and control, and says it was not done", () => {
    const action = activityActionOf({ phase: "exploring", detail: { kind: "tool", title: "Clicking “Add to cart”", status: "failed", ref: "core.run_node", text: "Result: llm_evidence_loop.repeat_refused · Reason: failed" } });
    expect(action).toMatchObject({ kind: "click", target: "Add to cart", outcome: "failed", why: "it was already tried exactly this way and did not work", refused: { all: true } });
  });
});
