import { expect, it } from "vitest";
import { ModelRunBudgetLedger } from "../../../agents/ledger/index.ts";
import { resultRunAccounting } from "../index.ts";

it("projects the original ledger with its receiver and preserves omitted calls", () => {
  class OriginalLedger extends ModelRunBudgetLedger {
    #reads: string[] = [];
    override callRecords(runId: string) {
      this.#reads.push("calls");
      return super.callRecords(runId);
    }
    override snapshot(runId: string) {
      this.#reads.push("snapshot");
      return super.snapshot(runId);
    }
    reads() { return this.#reads; }
  }
  const ledger = new OriginalLedger({ maxTotalTokensPerRun: 100, maxOutputTokensPerRun: 20 }, {
    defaultCostCeilingUsd: 1, maxCallsPerRun: 4, recordLimit: 0,
    isTaskKind: (value): value is string => typeof value === "string",
    isStage: (value): value is string => typeof value === "string"
  });
  const reservation = ledger.reserve({ runId: "run.original", requestId: "call.original", estimatedInputTokens: 1, maxOutputTokens: 1, maxEstimatedCostUsd: 0.01 });
  if (!reservation.ok) throw new Error("test.reservation_refused");
  reservation.lease.complete();
  const result = resultRunAccounting({ current: { ledger } }, "run.original", { recovery: "retained" });
  expect(ledger.reads()).toEqual(["calls", "snapshot"]);
  expect(result).toMatchObject({ recovery: "retained", costAccounting: { calls: 1 }, providerCalls: [], providerCallsOmitted: 1 });
});

it("does not invent zero accounting when no canonical history can be read", () => {
  const result = resultRunAccounting({ history: { gate: undefined } }, "run.unknown", {
    recovery: "retained", costAccounting: { calls: 0 }, providerCalls: [], providerCallsOmitted: 0
  });
  expect(result).not.toHaveProperty("costAccounting");
  expect(result).not.toHaveProperty("providerCalls");
  expect(result).toMatchObject({ recovery: "retained", accountingDiagnostic: { code: "llm_budget.accounting_history_unavailable" } });
});
