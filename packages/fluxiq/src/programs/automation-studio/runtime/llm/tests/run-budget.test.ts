import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_LLM_RUN_CALL_BACKSTOP, AutomationStudioLlmRunBudgetLedger } from "../run-budget.ts";

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
    expect(ledger.snapshot("run.one")).toEqual({ calls: 2, explorationCalls: 0, inputTokens: 220, outputTokens: 65, totalTokens: 285, estimatedCostUsd: 0.2, budgetBreaches: 0, pendingCalls: 0 });
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

  // The decision this replaced: a run used to be bounded by a small call count
  // -- two for the diagnosis and the patch -- and an exploration was refused
  // before it looked at anything. A run is now bounded by tokens and money, and
  // a run whose calls come in under budget keeps going.
  it("lets a run make far more calls than the old limits when tokens and money allow", () => {
    const ledger = new AutomationStudioLlmRunBudgetLedger({ maxTotalTokensPerRun: 144_000, maxOutputTokensPerRun: 48_000, maxEstimatedCostUsdPerRun: 0.25 });
    for (let index = 0; index < 40; index += 1) {
      const lease = ledger.reserve({ runId: "run.long", requestId: `request.${index}`, estimatedInputTokens: 8_000, maxOutputTokens: 2_000, maxEstimatedCostUsd: 0.25 / 24, allowance: index % 2 ? "exploration" : "run" });
      expect(lease).toMatchObject({ ok: true });
      if (lease.ok) lease.lease.complete({ inputTokens: 1_200, outputTokens: 200, totalTokens: 1_400, estimatedCostUsd: 0.002 });
    }

    expect(ledger.snapshot("run.long")).toMatchObject({ calls: 40, explorationCalls: 20, totalTokens: 56_000, pendingCalls: 0 });
  });

  // Exploration is a label on the receipt now, not a second allowance. It is
  // counted inside `calls`, and it draws on the one backstop like everything
  // else, so there is no longer a number that bounds only one kind of call.
  it("counts exploration calls on the receipt and against the one backstop", () => {
    const ledger = new AutomationStudioLlmRunBudgetLedger({ maxCallsPerRun: 3, maxTotalTokensPerRun: 10_000, maxOutputTokensPerRun: 10_000, maxEstimatedCostUsdPerRun: 1 });
    for (const [requestId, allowance] of [["request.diagnosis", "run"], ["request.explore", "exploration"], ["request.patch", "run"]] as const) {
      const lease = ledger.reserve({ runId: "run.label", requestId, estimatedInputTokens: 100, maxOutputTokens: 100, maxEstimatedCostUsd: 0.1, allowance });
      expect(lease.ok).toBe(true);
      if (lease.ok) lease.lease.complete({ inputTokens: 10, outputTokens: 10, totalTokens: 20 });
    }

    expect(ledger.snapshot("run.label")).toMatchObject({ calls: 3, explorationCalls: 1 });
    expect(ledger.reserve({ runId: "run.label", requestId: "request.more", estimatedInputTokens: 1, maxOutputTokens: 1, maxEstimatedCostUsd: 0.1, allowance: "exploration" }))
      .toMatchObject({ ok: false, diagnostic: { code: "llm_budget.run_call_limit" } });
  });

  // The backstop is still there for the one case the real guards cannot catch:
  // calls that cost nothing and use no tokens, forever.
  it("defaults the call count to a far-away backstop that still stops a runaway", () => {
    const ledger = new AutomationStudioLlmRunBudgetLedger({ maxTotalTokensPerRun: 10_000_000, maxOutputTokensPerRun: 10_000_000, maxEstimatedCostUsdPerRun: 10 });
    let admitted = 0;
    for (let index = 0; index < AUTOMATION_STUDIO_LLM_RUN_CALL_BACKSTOP + 5; index += 1) {
      const lease = ledger.reserve({ runId: "run.runaway", requestId: `request.${index}`, estimatedInputTokens: 1, maxOutputTokens: 1, maxEstimatedCostUsd: 0.000_001 });
      if (!lease.ok) {
        expect(lease.diagnostic.code).toBe("llm_budget.run_call_limit");
        break;
      }
      admitted += 1;
      lease.lease.complete({ inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 });
    }

    expect(AUTOMATION_STUDIO_LLM_RUN_CALL_BACKSTOP).toBeGreaterThanOrEqual(100);
    expect(admitted).toBe(AUTOMATION_STUDIO_LLM_RUN_CALL_BACKSTOP);
  });

  // With calls out of the way, money and tokens are what end a run -- and they
  // still end it, on their own codes, with the backstop nowhere near.
  it("still stops a run at its token or cost ceiling, whatever the call count", () => {
    const tokens = new AutomationStudioLlmRunBudgetLedger({ maxTotalTokensPerRun: 300, maxOutputTokensPerRun: 300, maxEstimatedCostUsdPerRun: 1 });
    const first = tokens.reserve({ runId: "run.global", requestId: "request.one", estimatedInputTokens: 150, maxOutputTokens: 100, allowance: "exploration", maxEstimatedCostUsd: 0.1 });
    expect(first.ok).toBe(true);
    if (first.ok) first.lease.complete();
    expect(tokens.reserve({ runId: "run.global", requestId: "request.two", estimatedInputTokens: 150, maxOutputTokens: 100, allowance: "exploration", maxEstimatedCostUsd: 0.1 }))
      .toMatchObject({ ok: false, diagnostic: { code: "llm_budget.run_total_limit" } });

    const cost = new AutomationStudioLlmRunBudgetLedger({ maxTotalTokensPerRun: 10_000_000, maxOutputTokensPerRun: 10_000_000, maxEstimatedCostUsdPerRun: 0.255 });
    let paid = 0;
    for (let index = 0; index < 100; index += 1) {
      const lease = cost.reserve({ runId: "run.purse", requestId: `request.${index}`, estimatedInputTokens: 10, maxOutputTokens: 10, maxEstimatedCostUsd: 0.02 });
      if (!lease.ok) {
        expect(lease.diagnostic.code).toBe("llm_budget.run_cost_limit");
        break;
      }
      paid += 1;
      lease.lease.complete({ inputTokens: 5, outputTokens: 5, totalTokens: 10, estimatedCostUsd: 0.01 });
    }
    // Each call reserves two cents and spends one, so the twenty-fifth
    // reservation is the first that would overrun a 25.5-cent purse. The run
    // stops there, on money, nowhere near the backstop of 250.
    expect(paid).toBe(24);
    expect(cost.snapshot("run.purse").estimatedCostUsd).toBeLessThanOrEqual(0.255);
  });

  it("charges valid actual overages instead of under-accounting them", () => {
    const ledger = new AutomationStudioLlmRunBudgetLedger({ maxCallsPerRun: 1, maxTotalTokensPerRun: 100, maxOutputTokensPerRun: 50, maxEstimatedCostUsdPerRun: 0.1 });
    const reserved = ledger.reserve({ runId: "run.overage", requestId: "request.overage", estimatedInputTokens: 50, maxOutputTokens: 50, maxEstimatedCostUsd: 0.1 });
    expect(reserved.ok).toBe(true);
    if (reserved.ok) reserved.lease.complete({ inputTokens: 80, outputTokens: 60, totalTokens: 140, estimatedCostUsd: 0.2 });
    expect(ledger.snapshot("run.overage")).toMatchObject({ inputTokens: 80, outputTokens: 60, totalTokens: 140, estimatedCostUsd: 0.2, budgetBreaches: 1 });
  });

  // A hold is a reservation no call spends. While it is held, every other
  // reservation is refused as if it were a call in flight; released, it leaves
  // no trace on the receipt, and a lease settles only once.
  it("holds a reservation that other calls cannot spend, and releases it without charging anything", () => {
    const ledger = new AutomationStudioLlmRunBudgetLedger({ maxCallsPerRun: 2, maxTotalTokensPerRun: 1_000, maxOutputTokensPerRun: 1_000, maxEstimatedCostUsdPerRun: 0.2 });
    const hold = ledger.reserve({ runId: "run.hold", requestId: "recovery.patch-reserve", estimatedInputTokens: 400, maxOutputTokens: 100, maxEstimatedCostUsd: 0.1 });
    expect(hold.ok).toBe(true);
    if (!hold.ok) return;
    expect(ledger.snapshot("run.hold")).toMatchObject({ calls: 0, pendingCalls: 1 });
    // Tokens, money and the call count are each held.
    expect(ledger.reserve({ runId: "run.hold", requestId: "request.tokens", estimatedInputTokens: 450, maxOutputTokens: 100, maxEstimatedCostUsd: 0.05 })).toMatchObject({ ok: false, diagnostic: { code: "llm_budget.run_total_limit" } });
    expect(ledger.reserve({ runId: "run.hold", requestId: "request.money", estimatedInputTokens: 10, maxOutputTokens: 10, maxEstimatedCostUsd: 0.11 })).toMatchObject({ ok: false, diagnostic: { code: "llm_budget.run_cost_limit" } });
    const explore = ledger.reserve({ runId: "run.hold", requestId: "request.explore", estimatedInputTokens: 10, maxOutputTokens: 10, maxEstimatedCostUsd: 0.05, allowance: "exploration" });
    expect(explore.ok).toBe(true);
    if (explore.ok) explore.lease.complete({ inputTokens: 5, outputTokens: 5, totalTokens: 10, estimatedCostUsd: 0.01 });
    expect(ledger.reserve({ runId: "run.hold", requestId: "request.third", estimatedInputTokens: 1, maxOutputTokens: 1, maxEstimatedCostUsd: 0.01 })).toMatchObject({ ok: false, diagnostic: { code: "llm_budget.run_call_limit" } });

    hold.lease.release();
    hold.lease.release();
    hold.lease.complete({ inputTokens: 400, outputTokens: 100, totalTokens: 500 });
    expect(ledger.snapshot("run.hold")).toEqual({ calls: 1, explorationCalls: 1, inputTokens: 5, outputTokens: 5, totalTokens: 10, estimatedCostUsd: 0.01, budgetBreaches: 0, pendingCalls: 0 });
    // What was held is spendable again, by the call it was held for.
    expect(ledger.reserve({ runId: "run.hold", requestId: "request.patch", estimatedInputTokens: 400, maxOutputTokens: 100, maxEstimatedCostUsd: 0.1 }).ok).toBe(true);
  });
});
