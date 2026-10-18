import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLlmRunPurse } from "../../llm/index.ts";

/** Project the canonical ledger, preserving recovery facts and unknown historical accounting. */
export function automationStudioResultRunAccounting(purse: AutomationStudioLlmRunPurse | undefined, runId: string, previous: unknown): JsonObject | undefined {
  if (!purse) return undefined;
  const retained = typeof previous === "object" && previous !== null && !Array.isArray(previous) ? previous as JsonObject : {};
  if (!purse.current) {
    const facts = { ...retained };
    if (purse.history) for (const key of ["costAccounting", "providerCalls", "providerCallsOmitted"]) delete facts[key];
    const historical = purse.history?.gate;
    const saved = typeof historical === "object" && historical !== null && !Array.isArray(historical) ? historical as JsonObject : undefined;
    if (saved) return {
      ...saved, ...facts,
      ...("costAccounting" in saved ? { costAccounting: saved.costAccounting! } : {}),
      ...("providerCalls" in saved ? { providerCalls: saved.providerCalls! } : {}),
      ...("providerCallsOmitted" in saved ? { providerCallsOmitted: saved.providerCallsOmitted! } : {}),
      ...(purse.diagnostic ? { accountingDiagnostic: { ...purse.diagnostic } } : {})
    };
    return purse.history || purse.diagnostic ? { ...facts, accountingDiagnostic: purse.diagnostic ? { ...purse.diagnostic } : { code: "llm_budget.accounting_history_unavailable", message: "This continued run has no restorable canonical accounting receipt." } } : undefined;
  }
  const receipt = purse.current.ledger.callRecords(runId);
  return {
    ...retained,
    costAccounting: purse.current.ledger.snapshot(runId),
    providerCalls: receipt.calls,
    providerCallsOmitted: receipt.omitted,
    ...(purse.diagnostic ? { accountingDiagnostic: { ...purse.diagnostic } } : {})
  };
}
