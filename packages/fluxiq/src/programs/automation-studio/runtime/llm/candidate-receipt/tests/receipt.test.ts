import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmEvidenceEntry } from "../../context-window.ts";
import { automationStudioLlmEvidenceLatestCandidateReceipt, automationStudioLlmEvidenceUntestableReceiptWords } from "../index.ts";

const submission = (value: AutomationStudioLlmEvidenceEntry["value"]): AutomationStudioLlmEvidenceEntry => ({ callId: "submitted", toolId: "core.submit_candidate", value });
const receipt = { ok: true, revision: 3, digest: "c".repeat(64) };

describe("the latest accepted candidate receipt", () => {
  it("selects the latest submission, ignoring cache notes that point at an older receipt", () => {
    const entries = [submission(receipt), submission({ ...receipt, revision: 5, digest: "d".repeat(64) }), { callId: "cached", toolId: "core.request_check", value: { answeredByCallId: "submitted", candidate: { revision: 3, digest: receipt.digest } } }];
    expect(automationStudioLlmEvidenceLatestCandidateReceipt(entries)).toEqual({ revision: 5, digest: "d".repeat(64) });
  });

  // Live run `run-mv6i27oi-a87fb247` (D2): revision 1 was accepted and judged
  // no, the next submission was refused, and the notes said "No candidate has
  // been accepted". A refusal is no revision; the accepted one stays current.
  it("reports the latest accepted revision when a refused submission came after it", () => {
    // A refusal that is not an unchanged one clears it as the revision to test (t741): still reported, marked stale.
    expect(automationStudioLlmEvidenceLatestCandidateReceipt([submission(receipt), submission({ ok: false, revision: 4 })])).toEqual({ revision: 3, digest: receipt.digest, stale: true });
    expect(automationStudioLlmEvidenceLatestCandidateReceipt([submission(receipt), submission({ ok: false, revision: 4 }), submission({ ok: false, revision: 5 })])).toEqual({ revision: 3, digest: receipt.digest, stale: true });
  });

  it("reports none when every submission was refused", () => {
    expect(automationStudioLlmEvidenceLatestCandidateReceipt([submission({ ok: false, revision: 1 }), submission({ ok: false, revision: 2 })])).toBeUndefined();
  });

  it("never walks back past a newer accepted submission whose receipt is malformed", () => {
    expect(automationStudioLlmEvidenceLatestCandidateReceipt([submission(receipt), submission({ ...receipt, revision: 4, digest: "untrusted" })])).toBeUndefined();
  });

  it.each([null, [], { ...receipt, ok: false }, { ...receipt, revision: 0 }, { ...receipt, revision: 1.5 }, { ...receipt, digest: "untrusted" }])("does not invent a receipt from malformed evidence %j", (value) => {
    expect(automationStudioLlmEvidenceLatestCandidateReceipt([submission(value)])).toBeUndefined();
  });
});

// Social `run-mvgoawg4-ed85dd5a` 0133-0169: revision 5 was tried
// (`execution_failed`), sent again and accepted as revision 5, then refused
// submissions cleared it; the notes still said to test it, and the gate called
// it stale. The receipt says both, so no note recommends that test.
describe("what stops the latest receipt being tested (t741)", () => {
  const trial = (verdict: string, of: { revision: number; digest: string } = receipt): AutomationStudioLlmEvidenceEntry => ({ callId: "tried", toolId: "core.test_subflow", value: { ok: verdict === "yes", verdict, revision: of.revision, digest: of.digest } });
  const subflow = (value: AutomationStudioLlmEvidenceEntry["value"]): AutomationStudioLlmEvidenceEntry => ({ callId: "submitted", toolId: "core.submit_subflow", value });
  const refused = (code: string, revision: number) => ({ ok: false, revision, diagnostics: { ok: false, code } });
  const latest = (entries: AutomationStudioLlmEvidenceEntry[]) => automationStudioLlmEvidenceLatestCandidateReceipt(entries, "core.submit_subflow");

  it("names the failed trial and the clearing refusal of the social run's revision 5", () => {
    const entries = [subflow(receipt), trial("execution_failed"), subflow({ ...receipt, revision: 4, digest: "e".repeat(64) }), trial("no", { revision: 4, digest: "e".repeat(64) }), subflow(receipt),
      subflow(refused("flow_bootstrap.completion_refused", 6)), subflow(refused("candidate.unchanged_after_no", 4)), subflow(refused("flow_bootstrap.completion_refused", 7))];
    expect(latest(entries)).toEqual({ revision: 3, digest: receipt.digest, lastTrial: "execution_failed", stale: true });
  });

  it("reads the latest trial of exactly that receipt, and only a failure on record", () => {
    expect(latest([subflow(receipt), trial("no")])).toEqual({ revision: 3, digest: receipt.digest, lastTrial: "no" });
    expect(latest([subflow(receipt), trial("execution_failed"), trial("yes")])).toEqual({ revision: 3, digest: receipt.digest });
    // The gate still retests an unsure or unjudged trial (`../../../flow-bootstrap/candidate/stall-retest.ts`).
    expect(latest([subflow(receipt), trial("unsure")])).toEqual({ revision: 3, digest: receipt.digest });
    expect(latest([subflow(receipt), trial("not_judged")])).toEqual({ revision: 3, digest: receipt.digest });
    expect(latest([subflow(receipt), trial("no", { revision: 3, digest: "f".repeat(64) })])).toEqual({ revision: 3, digest: receipt.digest });
    expect(latest([subflow(receipt), { callId: "noted", toolId: "core.request_check", value: { verdict: "no", candidate: { revision: 3, digest: receipt.digest } } }])).toEqual({ revision: 3, digest: receipt.digest });
  });

  it("reads each refusal as the submission controller treats it", () => {
    // An unchanged resubmission puts the last accepted revision back.
    expect(latest([subflow(receipt), subflow(refused("flow_bootstrap.completion_refused", 4)), subflow(refused("candidate.unchanged_submission", 3))])).toEqual({ revision: 3, digest: receipt.digest });
    // A refusal of a refuted Flow, or a kept-condition or kept-step hint, leaves whatever stood.
    for (const code of ["candidate.unchanged_after_no", "candidate.kept_condition_dropped", "candidate.kept_step_dropped"]) {
      expect(latest([subflow(receipt), subflow(refused(code, 4))])).toEqual({ revision: 3, digest: receipt.digest });
      expect(latest([subflow(receipt), subflow(refused("subflow.scope_refused", 4)), subflow(refused(code, 5))])).toEqual({ revision: 3, digest: receipt.digest, stale: true });
    }
    // Any other refusal clears it, even after it was put back.
    expect(latest([subflow(receipt), subflow(refused("candidate.unchanged_submission", 3)), subflow(refused("subflow.scope_refused", 4))])).toEqual({ revision: 3, digest: receipt.digest, stale: true });
  });

  it("says what stops a test instead of recommending one", () => {
    const tools = { submit: "core.submit_subflow", test: "core.test_subflow" };
    expect(automationStudioLlmEvidenceUntestableReceiptWords({ revision: 3, digest: receipt.digest }, tools)).toBeUndefined();
    const failed = automationStudioLlmEvidenceUntestableReceiptWords({ revision: 3, digest: receipt.digest, lastTrial: "execution_failed", stale: true }, tools)!;
    expect(failed).toContain("Its trial already answered execution_failed.");
    expect(failed).toContain("core.test_subflow would refuse it as stale");
    expect(failed).toContain("Do not test it again: a changed submission is needed.");
    expect(failed).toContain("submit the whole candidate with core.submit_subflow");
    expect(failed).not.toMatch(/Use core\.test_subflow with that exact revision/u);
    const cleared = automationStudioLlmEvidenceUntestableReceiptWords({ revision: 3, digest: receipt.digest, stale: true }, tools)!;
    expect(cleared).toContain("would refuse it as stale");
    expect(cleared).toContain("submit the whole candidate again with core.submit_subflow");
    expect(cleared).not.toContain("trial already answered");
  });
});
