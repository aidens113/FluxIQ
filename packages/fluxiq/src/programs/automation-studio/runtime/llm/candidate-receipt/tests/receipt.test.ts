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

  it("does not reuse an older accepted receipt after a refused submission", () => {
    expect(automationStudioLlmEvidenceLatestCandidateReceipt([submission(receipt), submission({ ok: false, revision: 4 })])).toBeUndefined();
  });

  it.each([null, [], { ...receipt, ok: false }, { ...receipt, revision: 0 }, { ...receipt, revision: 1.5 }, { ...receipt, digest: "untrusted" }])("does not invent a receipt from malformed evidence %j", (value) => {
    expect(automationStudioLlmEvidenceLatestCandidateReceipt([submission(value)])).toBeUndefined();
  });
});
