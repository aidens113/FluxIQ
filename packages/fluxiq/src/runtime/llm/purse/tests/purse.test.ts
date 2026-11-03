import { describe, expect, it } from "vitest";
import { AutomationStudioLlmRunPurse } from "../purse.ts";
import type { AutomationStudioLlmRunBudgetProfile } from "../profile.ts";

const profile: AutomationStudioLlmRunBudgetProfile = {
  ledger: { maxCallsPerRun: 8, maxTotalTokensPerRun: 1000, maxOutputTokensPerRun: 500, maxEstimatedCostUsdPerRun: 0.1 },
  maxEstimatedCostUsdPerCall: 0.02, maxEstimatedCostUsdPerCallAt: () => 0.02
};

function settled() {
  const purse = new AutomationStudioLlmRunPurse();
  const ledger = purse.open("run.one", profile)!;
  const reservation = ledger.reserve({ runId: "run.one", requestId: "request.paid", estimatedInputTokens: 10, maxOutputTokens: 10, maxEstimatedCostUsd: 0.02 });
  expect(reservation.ok).toBe(true);
  if (reservation.ok) reservation.lease.complete({ inputTokens: 4, outputTokens: 2, totalTokens: 6, estimatedCostUsd: 0.001 });
  return { costAccounting: ledger.snapshot("run.one"), providerCalls: ledger.callRecords("run.one").calls, providerCallsOmitted: 0 };
}

describe("a run-owned canonical purse", () => {
  it("shares one ledger without widening limits or making a later per-call grant global", () => {
    const purse = new AutomationStudioLlmRunPurse();
    const first = purse.open("run.one", profile);
    expect(purse.open("run.one", { ...profile, maxEstimatedCostUsdPerCall: 0.0001, ledger: { ...profile.ledger, maxCallsPerRun: 20 } })).toBe(first);
    expect(purse.current?.budget.ledger.maxCallsPerRun).toBe(8);
    expect(purse.open("run.one", { ...profile, ledger: { ...profile.ledger, maxCallsPerRun: 7 } })).toBeUndefined();
    expect(purse.diagnostic?.code).toBe("llm_budget.accounting_profile_incompatible");
  });

  it("restores settled paid continuation, identities and additive totals exactly once", () => {
    const receipt = settled();
    const purse = new AutomationStudioLlmRunPurse({ runId: "run.one", gate: receipt });
    const ledger = purse.open("run.one", profile)!;
    expect(ledger.snapshot("run.one")).toEqual(receipt.costAccounting);
    expect(ledger.reserve({ runId: "run.one", requestId: "request.paid", estimatedInputTokens: 1, maxOutputTokens: 1 })).toMatchObject({ ok: false, diagnostic: { code: "llm_budget.duplicate_request" } });
    const next = ledger.reserve({ runId: "run.one", requestId: "request.next", estimatedInputTokens: 10, maxOutputTokens: 10, maxEstimatedCostUsd: 0.02 });
    expect(next.ok).toBe(true);
    if (next.ok) { next.lease.complete({ inputTokens: 4, outputTokens: 2, totalTokens: 6, estimatedCostUsd: 0.001 });
      next.lease.complete(); }
    expect(purse.open("run.one", profile)).toBe(ledger);
    expect(ledger.snapshot("run.one")).toMatchObject({ calls: 2, totalTokens: 12, estimatedCostUsd: 0.002, pendingCalls: 0 });
    expect(ledger.callRecords("run.one").calls[0]).toEqual(receipt.providerCalls[0]);
    expect(ledger.callRecords("run.one").calls[1]?.sequence).toBe(2);
  });

  it.each([undefined, {}, { providerCalls: [], providerCallsOmitted: 0 }])("refuses unknown historical accounting without opening a fresh ledger (%j)", (gate) => {
    const purse = new AutomationStudioLlmRunPurse({ runId: "run.one", gate });
    expect(purse.open("run.one", profile)).toBeUndefined();
    expect(purse.current).toBeUndefined();
    expect(purse.diagnostic?.code).toBe("llm_budget.accounting_history_unavailable");
  });

  it("refuses pending, malformed and omitted history and never rebinds another run", () => {
    for (const gate of [
      { ...settled(), costAccounting: { ...settled().costAccounting, pendingCalls: 1 } },
      { ...settled(), costAccounting: { ...settled().costAccounting, totalTokens: 7 } },
      { ...settled(), providerCallsOmitted: 1 }
    ]) {
      const before = structuredClone(gate);
      const purse = new AutomationStudioLlmRunPurse({ runId: "run.one", gate });
      expect(purse.open("run.one", profile)).toBeUndefined();
      expect(gate).toEqual(before);
    }
    const wrong = new AutomationStudioLlmRunPurse({ runId: "run.one", gate: settled() });
    expect(wrong.open("run.other", profile)).toBeUndefined();
    expect(wrong.diagnostic?.code).toBe("llm_budget.accounting_run_mismatch");
    expect(new AutomationStudioLlmRunPurse().open("run.new", profile)?.snapshot("run.new").calls).toBe(0);
  });
});
