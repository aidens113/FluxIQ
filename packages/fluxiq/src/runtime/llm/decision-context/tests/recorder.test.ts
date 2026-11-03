import { describe, expect, it } from "vitest";
import { AutomationStudioLlmDecisionContextRecorder } from "../index.ts";
import { answered, call, callSignature, completionSignature, recorded, refusedCompletion } from "./history-fixtures.ts";

describe("decision history recorder", () => {
  it("counts an answered request together with the executed call it repeats", () => {
    const recorder = recorded([[5, call("snap3", "snap3", { changed: "no" })]]);
    expect(recorder.record(6, answered("snap3", "snap3"))).toEqual({ times: 2, iterations: [5, 6] });
    expect(recorder.record(7, answered("snap3", "snap3"))).toEqual({ times: 3, iterations: [5, 6, 7] });
    expect(recorder.record(9, answered("snap3", "snap3"))).toEqual({ times: 4, iterations: [5, 6, 7, 9] });
    expect(recorder.repeats(callSignature({ actionId: "snap3" }))).toEqual({ times: 4, iterations: [5, 6, 7, 9] });
    // The first row repeats nothing; every later one points back at iteration 5.
    expect(recorder.records().map((record) => record.firstSeenAt)).toEqual([undefined, 5, 5, 5]);
  });

  it("counts a completion as the same attempt when it met the same answer over the same draft revision", () => {
    const recorder = new AutomationStudioLlmDecisionContextRecorder();
    // The summary is the model's prose and is reworded every time: the repeat is
    // the same refusal over the same draft, whatever the result said.
    expect(recorder.record(12, refusedCompletion({ summary: "Adds the towels." }, ["flow_bootstrap.missing_act"], 3))).toEqual({ times: 1, iterations: [12] });
    expect(recorder.record(13, refusedCompletion({ summary: "Adds towels to the cart." }, ["flow_bootstrap.missing_act"], 3))).toEqual({ times: 2, iterations: [12, 13] });
    // Refused for something else over the same draft: a different answer, so a new attempt.
    expect(recorder.record(14, refusedCompletion({ summary: "Adds towels to the cart." }, ["bootstrap.invalid_subflows"], 3))).toEqual({ times: 1, iterations: [14] });
    // The draft changed: the same refusal is a new attempt.
    expect(recorder.record(15, refusedCompletion({ summary: "Adds towels to the cart." }, ["flow_bootstrap.missing_act"], 4))).toEqual({ times: 1, iterations: [15] });
    // A completion is counted by its answer, never by its signature.
    expect(recorder.repeats(completionSignature({ summary: "Adds towels to the cart." }))).toEqual({ times: 0, iterations: [] });
  });

  it("counts unusable decisions by their issue codes, in any order", () => {
    const recorder = new AutomationStudioLlmDecisionContextRecorder();
    const signature = "unusable-signature";
    expect(recorder.record(2, { kind: "unusable", signature, issueCodes: ["b", "a"] })).toEqual({ times: 1, iterations: [2] });
    expect(recorder.record(3, { kind: "unusable", signature, issueCodes: ["a", "b"] })).toEqual({ times: 2, iterations: [2, 3] });
  });

  it("answers nothing for the initial look and a redirect, and does not count them", () => {
    const recorder = new AutomationStudioLlmDecisionContextRecorder();
    expect(recorder.record(0, { kind: "look", callId: "look-0", toolId: "core.observe", resultCode: "web.observe.succeeded" })).toBeUndefined();
    expect(recorder.record(3, { kind: "redirect", code: "llm_evidence_loop.no_progress" })).toBeUndefined();
    expect(recorder.records()).toHaveLength(2);
  });

  it("keeps only the closed codes of a completion's feedback, never the feedback itself", () => {
    const recorder = new AutomationStudioLlmDecisionContextRecorder();
    recorder.record(4, refusedCompletion({ script: "x" }, ["flow_bootstrap.missing_act"], 1, {
      ok: false,
      code: "flow_bootstrap.completion_refused",
      refusal: "flow_bootstrap.instructed_act_missing",
      issues: [{ code: "flow_bootstrap.missing_act", message: "The Flow does not pick the store." }],
      previous: "open the store picker and choose Millbrook",
      missingActs: [{ id: "pick-store", reason: "not_in_draft", text: "Pick the Millbrook store" }],
      instruction: "Add the act the instruction names."
    }));
    const [record] = recorder.records();
    expect(record!.detail).toEqual({
      code: "flow_bootstrap.completion_refused",
      refusal: "flow_bootstrap.instructed_act_missing",
      missingActs: [{ id: "pick-store", reason: "not_in_draft" }]
    });
    expect(JSON.stringify(record)).not.toMatch(/Millbrook|message|instruction|previous/);
  });

  it("refuses an iteration that goes backwards or is not a count", () => {
    const recorder = recorded([[4, call("a", "a")]]);
    expect(() => recorder.record(3, call("b", "b"))).toThrow(/before the last recorded iteration/);
    expect(() => recorder.record(-1, call("b", "b"))).toThrow(/non-negative integer/);
    expect(() => recorder.record(4.5, call("b", "b"))).toThrow(/non-negative integer/);
  });

  it("completes an amendment row once its rerun has run, as the same decision", () => {
    const recorder = new AutomationStudioLlmDecisionContextRecorder();
    recorder.record(19, { kind: "amendment", signature: "A", applied: 1, refusals: [{ step: 3, reason: "no_such_step", repeated: false }], withdrewChanged: [], rerun: 14 });
    recorder.record(19, call("rerun.14", "web.click"));
    recorder.settleAmendment(19, { refusals: [{ step: 14, reason: "act_already_named", repeated: true }], applied: 0, changed: "no" });
    // A row from another iteration is never touched.
    recorder.settleAmendment(20, { refusals: [], applied: 9, changed: "yes" });
    expect(recorder.records()[0]!.decision).toEqual({
      kind: "amendment", signature: "A", applied: 0, rerun: 14, withdrewChanged: [], changed: "no",
      refusals: [{ step: 3, reason: "no_such_step", repeated: false }, { step: 14, reason: "act_already_named", repeated: true }]
    });
    expect(recorder.repeats("A")).toEqual({ times: 1, iterations: [19] });
  });
});
