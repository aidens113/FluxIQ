import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmEvidenceEntry } from "../../context-window.ts";
import { automationStudioLlmEvidenceLatestCandidateReceipt } from "../index.ts";

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
    expect(automationStudioLlmEvidenceLatestCandidateReceipt([submission(receipt), submission({ ok: false, revision: 4 })])).toEqual({ revision: 3, digest: receipt.digest });
    expect(automationStudioLlmEvidenceLatestCandidateReceipt([submission(receipt), submission({ ok: false, revision: 4 }), submission({ ok: false, revision: 5 })])).toEqual({ revision: 3, digest: receipt.digest });
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
