import { describe, expect, it } from "vitest";
import { AutomationStudioLlmRunPurse } from "../../../llm/index.ts";
import { automationStudioResultRunAccounting } from "../accounting.ts";

describe("canonical run accounting projection", () => {
  it("preserves recovery evidence while projecting the same ledger repeatedly without addition", () => {
    const purse = new AutomationStudioLlmRunPurse();
    const ledger = purse.open("run.one", { ledger: { maxCallsPerRun: 4, maxTotalTokensPerRun: 100, maxOutputTokensPerRun: 50, maxEstimatedCostUsdPerRun: 0.1 }, maxEstimatedCostUsdPerCall: 0.01, maxEstimatedCostUsdPerCallAt: () => 0.01 })!;
    const hold = ledger.reserve({ runId: "run.one", requestId: "request.one", estimatedInputTokens: 10, maxOutputTokens: 10, maxEstimatedCostUsd: 0.01 });
    if (hold.ok) hold.lease.complete();
    const previous = { repairAuthority: { status: "funded" }, diagnostics: [{ code: "repair.saved" }], ok: true };
    const first = automationStudioResultRunAccounting(purse, "run.one", previous);
    expect(first).toMatchObject({ ...previous, costAccounting: { calls: 1, totalTokens: 20, estimatedCostUsd: 0.01, pendingCalls: 0 }, providerCallsOmitted: 0 });
    expect(automationStudioResultRunAccounting(purse, "run.one", first)).toEqual(first);
  });

  it("preserves unknown paid history and adds only a closed accounting refusal", () => {
    const previous = { costAccounting: { calls: 3 }, providerCallsOmitted: 3, repairAuthority: { status: "funded" } };
    const purse = new AutomationStudioLlmRunPurse({ runId: "run.one", gate: previous });
    purse.open("run.one", { ledger: { maxCallsPerRun: 4, maxTotalTokensPerRun: 100, maxOutputTokensPerRun: 50, maxEstimatedCostUsdPerRun: 0.1 }, maxEstimatedCostUsdPerCall: 0.01, maxEstimatedCostUsdPerCallAt: () => 0.01 });
    expect(automationStudioResultRunAccounting(purse, "run.one", previous)).toMatchObject({ ...previous, accountingDiagnostic: { code: "llm_budget.accounting_history_unavailable" } });
    expect(automationStudioResultRunAccounting(new AutomationStudioLlmRunPurse(), "run.new", undefined)).toBeUndefined();
  });

  it("restores historical canonical fields after a no-model recovery overwrote its gate before purse open", () => {
    const historical = { costAccounting: { calls: 2, pendingCalls: 0 }, providerCalls: [{ requestId: "request.paid" }], providerCallsOmitted: 1 };
    const purse = new AutomationStudioLlmRunPurse({ runId: "run.one", gate: historical });
    expect(automationStudioResultRunAccounting(purse, "run.one", { invoked: false, code: "llm.gate.unavailable", costAccounting: { calls: 0 } })).toEqual({ ...historical, invoked: false, code: "llm.gate.unavailable" });
    expect(purse.current).toBeUndefined();
    for (const gate of [undefined, {}]) {
      const unknown = new AutomationStudioLlmRunPurse({ runId: "run.one", gate });
      expect(automationStudioResultRunAccounting(unknown, "run.one", { costAccounting: { calls: 0 }, providerCalls: [], providerCallsOmitted: 0 })).not.toHaveProperty("costAccounting");
    }
  });
});
