// A build's test that ran against the recording first (trace plan P6), in
// words: which results were offline. Never a revision, digest, run id, trace
// id or code (t362), and an offline result never reads as "the test passed".
import { describe, expect, it } from "vitest";
import { automationStudioActivityCandidateResult } from "../index.ts";

const INTERNAL = /core\.|revision|digest|trace|\bcandidate\b|trial_|run\.|web\.|flow_bootstrap|\bt\d{2,}\b|[0-9a-f]{16,}|[a-z]+_[a-z]+/iu;
const ran = (evidence: Record<string, unknown>) => ({ kind: "llm_evidence_tool_execution", evidence, effectApplied: false });
const test = (evidence: Record<string, unknown>, toolId = "core.test_candidate") => {
  const result = automationStudioActivityCandidateResult(toolId, ran(evidence));
  expect(result?.words ?? "").not.toMatch(INTERNAL);
  return result;
};
const feedback = { steps: [{ step: 1, status: "succeeded" }, { step: 2, status: "failed", happened: "Nothing matched" }] };

describe("a test checked against the recorded run", () => {
  it("a recorded no says the site was not touched", () => {
    const said = test({ verdict: "no", checkedAgainst: "recorded_run", revision: 2, digest: "a".repeat(64), feedback });
    expect(said?.status).toBe("failed");
    expect(said?.words).toBe("checked against the recorded run, not the site: the Flow ran, but it didn't do what you asked: step 2 didn't work: nothing matched; 1 step done");
  });

  it("a part's test reads the same", () => {
    expect(test({ verdict: "no", checkedAgainst: "recorded_run", feedback }, "core.test_subflow")?.words).toMatch(/^checked against the recorded run, not the site: /u);
  });

  it("a pass against the recording, then on the site, says both", () => {
    const said = test({ verdict: "yes", offlineCheck: { outcome: "passed", said: "x" }, feedback: { steps: [{ step: 1, status: "succeeded" }] } });
    expect(said).toMatchObject({ status: "succeeded", outcome: "passed" });
    expect(said?.words).toBe("it passed against the recorded run, then on the site: the test passed and the Flow did what you asked: 1 step done");
  });

  it("a gap names the step and a plain reason", () => {
    const said = test({ verdict: "no", offlineCheck: { outcome: "gap", step: 3, why: "Its action changed", said: "x" }, feedback });
    expect(said?.words).toMatch(/^the recorded run couldn't answer step 3 \(its action changed\), so it was tested on the site: the Flow ran, but/u);
  });

  it("a gap with a coded reason leaves the reason out", () => {
    const said = test({ verdict: "yes", offlineCheck: { outcome: "gap", step: 3, why: "trace.operation_changed", said: "x" }, feedback: {} });
    expect(said?.words).toBe("the recorded run couldn't answer step 3, so it was tested on the site: the test passed and the Flow did what you asked");
  });

  it("an inconclusive check says it could not settle it", () => {
    const said = test({ verdict: "unsure", offlineCheck: { outcome: "inconclusive", said: "x" }, feedback: {} });
    expect(said?.status).toBe("failed");
    expect(said?.words).toMatch(/^the recorded run couldn't settle it, so it was tested on the site: /u);
  });

  it("a test with no offline part reads as before", () => {
    expect(test({ verdict: "yes", feedback: {} })?.words).toBe("the test passed and the Flow did what you asked");
  });
});
