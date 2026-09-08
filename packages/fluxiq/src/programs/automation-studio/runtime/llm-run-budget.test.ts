import { describe, expect, it } from "vitest";
import { AutomationStudioLlmRunBudgetLedger } from "./llm-run-budget.ts";

describe("Automation Studio LLM run budget ledger", () => {
  it("atomically reserves calls and worst-case output, then releases unused capacity on completion", () => {
    const ledger = new AutomationStudioLlmRunBudgetLedger({ maxCallsPerRun: 2, maxTotalTokensPerRun: 1000, maxOutputTokensPerRun: 400, maxEstimatedCostUsdPerRun: 0.25 });
    const diagnosis = ledger.reserve({ runId: "run.one", requestId: "request.diagnosis", estimatedInputTokens: 200, maxOutputTokens: 200, maxEstimatedCostUsd: 0.1 });
    expect(diagnosis.ok).toBe(true);
    expect(ledger.reserve({ runId: "run.one", requestId: "request.concurrent", estimatedInputTokens: 200, maxOutputTokens: 250, maxEstimatedCostUsd: 0.1 })).toMatchObject({ ok: false, diagnostic: { code: "llm_budget.run_output_limit" } });
    if (diagnosis.ok) diagnosis.lease.complete({ inputTokens: 100, outputTokens: 25, totalTokens: 125 });

    const patch = ledger.reserve({ runId: "run.one", requestId: "request.patch", estimatedInputTokens: 200, maxOutputTokens: 250, maxEstimatedCostUsd: 0.1 });
    expect(patch.ok).toBe(true);
    if (patch.ok) patch.lease.complete({ inputTokens: 120, outputTokens: 40, totalTokens: 160 });
    expect(ledger.snapshot("run.one")).toEqual({ calls: 2, inputTokens: 220, outputTokens: 65, totalTokens: 285, estimatedCostUsd: 0.2, budgetBreaches: 0, pendingCalls: 0 });
  });

  it("rejects duplicate IDs and exhausted call/total budgets", () => {
    const ledger = new AutomationStudioLlmRunBudgetLedger({ maxCallsPerRun: 1, maxTotalTokensPerRun: 300, maxOutputTokensPerRun: 200 });
    const first = ledger.reserve({ runId: "run.one", requestId: "request.one", estimatedInputTokens: 100, maxOutputTokens: 100 });
    expect(first.ok).toBe(true);
    expect(ledger.reserve({ runId: "run.one", requestId: "request.one", estimatedInputTokens: 1, maxOutputTokens: 1 })).toMatchObject({ ok: false, diagnostic: { code: "llm_budget.duplicate_request" } });
    if (first.ok) first.lease.complete();
    expect(ledger.reserve({ runId: "run.one", requestId: "request.two", estimatedInputTokens: 1, maxOutputTokens: 1 })).toMatchObject({ ok: false, diagnostic: { code: "llm_budget.run_call_limit" } });

    const total = new AutomationStudioLlmRunBudgetLedger({ maxCallsPerRun: 2, maxTotalTokensPerRun: 100, maxOutputTokensPerRun: 100 });
    expect(total.reserve({ runId: "run.two", requestId: "request.large", estimatedInputTokens: 75, maxOutputTokens: 50 })).toMatchObject({ ok: false, diagnostic: { code: "llm_budget.run_total_limit" } });
  });

  it("rejects invalid identifiers/numbers and charges invalid usage at the reservation", () => {
    const ledger = new AutomationStudioLlmRunBudgetLedger({ maxCallsPerRun: 2, maxTotalTokensPerRun: 500, maxOutputTokensPerRun: 200 });
    expect(ledger.reserve({ runId: "", requestId: "request.one", estimatedInputTokens: -1, maxOutputTokens: 1 })).toMatchObject({ ok: false, diagnostic: { code: "llm_budget.invalid_reservation" } });
    const lease = ledger.reserve({ runId: "run.safe", requestId: "request.safe", estimatedInputTokens: 100, maxOutputTokens: 100 });
    expect(lease.ok).toBe(true);
    if (lease.ok) lease.lease.complete({ inputTokens: 1, outputTokens: 1, totalTokens: 99 });
    expect(ledger.snapshot("run.safe")).toMatchObject({ inputTokens: 100, outputTokens: 100, totalTokens: 200, pendingCalls: 0 });
  });

  it("atomically blocks cost oversubscription and retains unknown-call cost", () => {
    const ledger = new AutomationStudioLlmRunBudgetLedger({ maxCallsPerRun: 2, maxTotalTokensPerRun: 500, maxOutputTokensPerRun: 200, maxEstimatedCostUsdPerRun: 0.25 });
    const first = ledger.reserve({ runId: "run.cost", requestId: "request.cost.one", estimatedInputTokens: 50, maxOutputTokens: 50, maxEstimatedCostUsd: 0.2 });
    expect(first.ok).toBe(true);
    expect(ledger.reserve({ runId: "run.cost", requestId: "request.cost.two", estimatedInputTokens: 10, maxOutputTokens: 10, maxEstimatedCostUsd: 0.1 })).toMatchObject({ ok: false, diagnostic: { code: "llm_budget.run_cost_limit" } });
    if (first.ok) first.lease.complete();
    expect(ledger.snapshot("run.cost").estimatedCostUsd).toBe(0.2);
  });

  it("charges valid actual overages instead of under-accounting them", () => {
    const ledger = new AutomationStudioLlmRunBudgetLedger({ maxCallsPerRun: 1, maxTotalTokensPerRun: 100, maxOutputTokensPerRun: 50, maxEstimatedCostUsdPerRun: 0.1 });
    const reserved = ledger.reserve({ runId: "run.overage", requestId: "request.overage", estimatedInputTokens: 50, maxOutputTokens: 50, maxEstimatedCostUsd: 0.1 });
    expect(reserved.ok).toBe(true);
    if (reserved.ok) reserved.lease.complete({ inputTokens: 80, outputTokens: 60, totalTokens: 140, estimatedCostUsd: 0.2 });
    expect(ledger.snapshot("run.overage")).toMatchObject({ inputTokens: 80, outputTokens: 60, totalTokens: 140, estimatedCostUsd: 0.2, budgetBreaches: 1 });
  });
});
