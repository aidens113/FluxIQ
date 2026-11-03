import { describe, expect, it } from "vitest";
import { ModelRunBudgetLedger, type ModelRunLedgerPolicy } from "../index.ts";

const policy: ModelRunLedgerPolicy = {
  defaultCostCeilingUsd: 0.05,
  maxCallsPerRun: 4,
  recordLimit: 4,
  isTaskKind: (value): value is string => value === "record_review",
  isStage: (value): value is string => value === "evaluation"
};
const limits = { maxTotalTokensPerRun: 1000, maxOutputTokensPerRun: 200 };
const request = {
  runId: "run.records", requestId: "request.record", estimatedInputTokens: 100, maxOutputTokens: 20, maxEstimatedCostUsd: 0.01,
  call: { taskKind: "record_review", stage: "evaluation", promptVersion: "v1", provider: "mock", model: "mock-model" }
};

function settled() {
  const ledger = new ModelRunBudgetLedger(limits, policy);
  const reserved = ledger.reserve(request);
  if (!reserved.ok) throw new Error("The fixture reservation must fit.");
  const usage = { inputTokens: 7, outputTokens: 3, totalTokens: 10, estimatedCostUsd: 0.004 };
  reserved.lease.complete(usage, { validationOk: true, issueCodes: [] });
  reserved.lease.complete(usage);
  return { ledger, receipt: { costAccounting: ledger.snapshot(request.runId), providerCalls: ledger.callRecords(request.runId).calls, providerCallsOmitted: 0 } };
}

describe("a program-independent model run ledger", () => {
  it("charges reported dollars once and itemizes calls using only its supplied vocabulary", () => {
    const { ledger } = settled();
    expect(ledger.snapshot(request.runId)).toMatchObject({ calls: 1, inputTokens: 7, outputTokens: 3, totalTokens: 10, estimatedCostUsd: 0.004, pendingCalls: 0 });
    expect(ledger.callRecords(request.runId).calls[0]).toMatchObject({ taskKind: "record_review", stage: "evaluation", charged: { tokens: "reported", cost: "reported" } });
    expect(ledger.reserve(request)).toMatchObject({ ok: false, diagnostic: { code: "llm_budget.duplicate_request" } });
  });

  it("restores canonical charges atomically and rejects receipt labels outside the program policy", () => {
    const { receipt } = settled();
    const restored = new ModelRunBudgetLedger(limits, policy);
    expect(restored.restore(request.runId, receipt)).toBe(true);
    expect(restored.callRecords(request.runId).calls).toEqual(receipt.providerCalls);
    expect(ModelRunBudgetLedger.receiptChange(undefined, receipt, policy)).toEqual({ calls: 1, costUsd: 0.004 });
    const malformed = structuredClone(receipt);
    malformed.providerCalls[0]!.taskKind = "outside_policy";
    const refused = new ModelRunBudgetLedger(limits, policy);
    expect(refused.restore(request.runId, malformed)).toBe(false);
    expect(refused.snapshot(request.runId)).toMatchObject({ calls: 0, estimatedCostUsd: 0 });
  });

  it("releases an unsent hold without inventing billed spend or a call", () => {
    const ledger = new ModelRunBudgetLedger(limits, policy);
    const reserved = ledger.reserve(request);
    if (!reserved.ok) throw new Error("The fixture reservation must fit.");
    reserved.lease.release();
    expect(ledger.snapshot(request.runId)).toMatchObject({ calls: 0, estimatedCostUsd: 0, pendingCalls: 0 });
    expect(ledger.callRecords(request.runId)).toEqual({ calls: [], omitted: 0 });
  });
});
