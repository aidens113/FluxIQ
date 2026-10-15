// How a candidate build's own calls end, in words (t373): accepted or declined
// steps, and a test's verdict with what its steps did. Never a tool id, a
// revision, a digest, a run id, a node id, a code or a handle (t362).
import { describe, expect, it } from "vitest";
import { automationStudioActivityCandidateResult } from "../index.ts";

const INTERNAL = /core\.|revision|digest|\bcandidate\b|trial_|run\.|web\.|flow_bootstrap|\bt\d{2,}\b|[0-9a-f]{16,}/iu;
const ran = (evidence: Record<string, unknown>, resultCode?: string) => ({ kind: "llm_evidence_tool_execution", evidence, effectApplied: false, ...(resultCode ? { resultCode } : {}) });
const submit = (evidence: Record<string, unknown>) => automationStudioActivityCandidateResult("core.submit_candidate", ran(evidence));
const test = (evidence: Record<string, unknown>, resultCode?: string) => automationStudioActivityCandidateResult("core.test_candidate", ran(evidence, resultCode));
const said = (result: ReturnType<typeof automationStudioActivityCandidateResult>) => {
  expect(result?.words ?? "").not.toMatch(INTERNAL);
  return result;
};

describe("saving a candidate's steps, in words", () => {
  it("accepted steps are done", () => {
    expect(said(submit({ ok: true, status: "draft", revision: 3, digest: "a".repeat(64), changedPaths: ["plan"] }))).toEqual({ status: "succeeded", part: "Said", words: "the steps were accepted", outcome: "done" });
  });

  it("refused steps are declined with what to fix, by the check's own reasons", () => {
    const refusal = (diagnostics: Record<string, unknown>, issueCodes: string[]) => said(submit({ ok: false, revision: 4, diagnostics, issueCodes, next: "Correct every listed issue" }));
    expect(refusal({ code: "flow_bootstrap.completion_refused", refusal: "flow_bootstrap.evidence_completion_parameters_unresolved", issues: [{ code: "web.handle.unknown", handles: [{ handle: "t478" }] }, { code: "web.handle.unknown", handles: [{ handle: "t488" }] }] }, ["web.handle.unknown"]))
      .toEqual({ status: "failed", part: "Declined", words: "some steps point at things that weren't seen on the page; 2 things to fix", outcome: "not done" });
    expect(refusal({ refusal: "flow_bootstrap.evidence_completion_plan_invalid", refusals: ["flow_bootstrap.evidence_completion_plan_invalid", "flow_bootstrap.evidence_completion_cannot_reach_start"], issues: [{ code: "x" }] }, ["x"])?.words)
      .toBe("some steps weren't written in a way the Flow can run and it can't get from where it starts to the page it needs");
    expect(refusal({ code: "candidate.loop_or_binding_refused", issues: [{ code: "a" }] }, ["a"])?.words).toBe("a repeat, or a value that changes as the Flow runs, wasn't written in a way the Flow can run");
    expect(refusal({ code: "candidate.superseded_submission" }, ["candidate.superseded_submission"])?.words).toBe("newer steps were sent while these were being checked");
    expect(refusal({}, ["something.unknown", "other.unknown"])?.words).toBe("some steps weren't written in a way the Flow can run; 2 things to fix");
  });
});

describe("testing a candidate's whole Flow, in words", () => {
  const yes = (feedback: Record<string, unknown>) => ({ ok: true, verdict: "yes", revision: 2, digest: "b".repeat(64), trialRunId: "run.trial-1", feedback });

  it("a pass says what the steps did, naming a step by its control, else its label without the handle it carried", () => {
    expect(said(test(yes({ steps: [
      { step: 1, definitionId: "web.output.browser-navigate", status: "succeeded" },
      { step: 2, definitionId: "web.output.dom-click", label: "Close popup t512", status: "failed", happened: "The step's control was not found on the page." },
      { step: 3, definitionId: "web.output.dom-click", status: "succeeded", skipped: "Its control was not on the page, so the step was skipped." },
      { step: 4, definitionId: "web.output.dom-click", control: "Add to cart", status: "succeeded" }
    ] }), "candidate.trial_yes"))).toEqual({ status: "succeeded", part: "Said", outcome: "passed",
      words: "the test passed and the Flow did what you asked: step 2, “Close popup”, didn't work and was passed over: the step's control was not found on the page; 2 steps done, 1 skipped" });
    expect(test(yes({ steps: [] }))?.words).toBe("the test passed and the Flow did what you asked");
  });

  it("a failed check says what it waited for and whether the page had it", () => {
    const check = (extra: Record<string, unknown>) => test({ ok: false, verdict: "execution_failed", feedback: { code: "executor.node_failed", steps: [{ step: 5, definitionId: "web.output.wait_for_text", label: "Wait for confirmation", status: "failed", happened: "The step, or the wait for its result, ran out of time.", ...extra }] } })?.words;
    expect(check({ waitedFor: "Added to your cart", textPresence: "hidden" })).toBe("step 5, “Wait for confirmation”, didn't work: “Added to your cart” was on the page but stayed hidden");
    expect(check({ waitedFor: "Added to your cart", textPresence: "absent" })).toBe("step 5, “Wait for confirmation”, didn't work: “Added to your cart” wasn't on the page");
    expect(check({ waitedFor: "Added to your cart" })).toBe("step 5, “Wait for confirmation”, didn't work: the page didn't show “Added to your cart”");
    expect(check({})).toBe("step 5, “Wait for confirmation”, didn't work: the step, or the wait for its result, ran out of time");
  });

  it("a run that never reached a step, or stopped between steps, says so rather than giving counts as its reason", () => {
    expect(said(test({ ok: false, verdict: "execution_failed", feedback: { code: "candidate.trial_port_failed" } }))).toMatchObject({ status: "failed", part: "Said", words: "the test couldn't run the Flow", outcome: "didn't pass" });
    expect(test({ ok: false, verdict: "execution_failed", feedback: { code: "executor.start_failed", steps: [] } })?.words).toBe("the Flow didn't get to its first step");
    expect(test({ ok: false, verdict: "execution_failed", feedback: { code: "executor.cancelled", steps: [{ step: 1, status: "succeeded" }, { step: 2, status: "succeeded" }] } })?.words).toBe("the Flow stopped before its end: 2 steps done");
  });

  it("names at most two steps that did not work, and counts the rest", () => {
    const steps = [1, 2, 3, 4].map((step) => ({ step, status: "failed", happened: "The step ran and did not work." }));
    expect(test({ ok: false, verdict: "no", feedback: { steps } })?.words).toBe("the Flow ran, but it didn't do what you asked: step 1 didn't work and was passed over: the step ran and did not work; step 2 didn't work and was passed over: the step ran and did not work; 2 more didn't work");
  });

  it.each([
    ["candidate.trial_input_invalid", "only the latest saved steps can be tested"],
    ["candidate.trial_stale_revision", "only the latest saved steps can be tested"],
    ["candidate.trial_unavailable", "no test can run here, so the Flow is kept as an untested draft"],
    ["candidate.trial_unchanged_after_no", "these exact steps already failed the test, so they have to change first"],
    ["candidate.trial_same_failure", "these steps stopped at the same step twice, so that step has to change first"],
    ["candidate.trial_retest_limit", "these steps were already tested as often as they may be, so they have to change first"],
    ["candidate.trial_reset_required", "the site first has to be put back the way the build found it"],
    ["candidate.trial_start_differs", "the start page still differs from the way the build found it"],
    ["candidate.trial_new_refusal", "the test couldn't start"]
  ])("a test the gate refused (%s) is declined: %s", (code, words) => {
    expect(said(test({ ok: false, code, instruction: "Call core.test_candidate with revision 3 and digest abc", latestRevision: 3 }, code))).toEqual({ status: "failed", part: "Declined", words, outcome: "not done" });
  });

  it("says nothing of any other tool or an answer of another shape", () => {
    expect(automationStudioActivityCandidateResult("core.run_node", ran({ ok: true }))).toBeUndefined();
    expect(automationStudioActivityCandidateResult("core.submit_candidate", { ok: true })).toBeUndefined();
    expect(automationStudioActivityCandidateResult("core.test_candidate", ran({ seen: true }))).toBeUndefined();
  });
});

// t649 (A8 frozen pair 3, `run-mv9zn5ob-d929084d`, 00012): a project builder's submission of its part,
// refused under `flow_bootstrap.evidence_completion_parameters_unresolved`, ended "succeeded" and read
// a green "Done". Every tool that saves or tests a builder's steps is read the same way.
describe("a project builder's part, saved and tested, in words", () => {
  const part = (toolId: string, evidence: Record<string, unknown>, resultCode?: string) => automationStudioActivityCandidateResult(toolId, ran(evidence, resultCode));

  it("a refused part is declined with Core's reasons, an accepted one is done", () => {
    const refused = said(part("core.submit_subflow", { ok: false, revision: 3, diagnostics: { ok: false, code: "flow_bootstrap.completion_refused", refusal: "flow_bootstrap.evidence_completion_parameters_unresolved", issues: [{ code: "web.handle.unknown", handles: [{ handle: "extraction.1" }] }] } }, "flow_bootstrap.evidence_completion_parameters_unresolved:c01a26f6"));
    expect(refused).toMatchObject({ status: "failed", part: "Declined", outcome: "not done" });
    expect(refused?.words).toBeTruthy();
    expect(said(part("core.submit_subflow", { ok: false, revision: 0, diagnostics: { ok: false, code: "subflow.scope_refused", issues: [{ code: "subflow.output_unknown_port" }] } }, "subflow.scope_refused:ba64ff77"))).toMatchObject({ status: "failed", part: "Declined" });
    expect(said(part("core.submit_subflow", { ok: true, revision: 4, digest: "c".repeat(64) }))).toEqual({ status: "succeeded", part: "Said", words: "the steps were accepted", outcome: "done" });
  });

  it("a part's test reads its verdict, and a refused test reads the candidate gate's words for its code", () => {
    expect(said(part("core.test_subflow", { ok: false, partial: true, verdict: "no", feedback: {} }, "subflow.trial_no"))).toMatchObject({ status: "failed", part: "Said", outcome: "didn't pass" });
    expect(said(part("core.test_subflow", { ok: true, partial: true, verdict: "yes", feedback: {} }, "subflow.trial_yes"))).toMatchObject({ status: "succeeded", outcome: "passed" });
    expect(said(part("core.test_subflow", { ok: false, code: "subflow.trial_stale_revision", instruction: "Only the latest proposal can be tested." }, "subflow.trial_stale_revision")))
      .toEqual({ status: "failed", part: "Declined", words: "only the latest saved steps can be tested", outcome: "not done" });
  });

  it("any other tool is not read here", () => {
    expect(part("core.run_node", { ok: false })).toBeUndefined();
  });
});
