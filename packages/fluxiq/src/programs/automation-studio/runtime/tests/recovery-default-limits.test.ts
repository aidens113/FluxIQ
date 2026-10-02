// The limits a caller's default resolution gives a recovery, held against the
// recovery's own.
//
// `runtime/llm/` may not import a value out of `runtime/recovery/`, so the
// session-key provider writes its per-call defaults as literals. This walks
// those defaults through the recovery's own run budget, so neither side can
// move without the other noticing. Nothing here is a grant: the numbers are a
// budget the loop enforces, not an authorization a call is checked against.

import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD,
  AUTOMATION_STUDIO_SESSION_KEY_PROVIDER_DEFAULTS,
  AutomationStudioLlmRunBudgetLedger,
  estimateAutomationStudioDeepSeekCostUsd
} from "../llm/index.ts";
import { automationStudioLlmProjectedCallCostUsd } from "../llm/build-purse/index.ts";
import {
  AUTOMATION_STUDIO_EXPLORATION_BUDGET_DEFAULTS,
  AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_MS,
  holdAutomationStudioRecoveryPatchReserve,
  resolveAutomationStudioRecoveryRunBudget
} from "../recovery/index.ts";

describe("the limits a caller's default resolution and a recovery share", () => {
  // A run a person asked the model into, on the defaults, has to buy a
  // diagnosis, a patch, and decisions left over to explore with. This sets the
  // patch's share aside as a recovery does and counts the exploration
  // decisions that still fit.
  it("gives a default run a diagnosis, a patch and decisions left over to explore with", () => {
    const defaults = AUTOMATION_STUDIO_SESSION_KEY_PROVIDER_DEFAULTS;
    expect(defaults.maxTotalEstimatedCostUsd).toBeLessThanOrEqual(AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD);

    const budget = resolveAutomationStudioRecoveryRunBudget({
      explicitRunBudget: true,
      resolution: {
        tokenLimits: defaults.tokenLimits,
        maxEstimatedCostUsd: defaults.maxEstimatedCostUsd,
        maxTotalEstimatedCostUsd: defaults.maxTotalEstimatedCostUsd
      }
    });
    expect(budget.ledger.maxEstimatedCostUsdPerRun).toBe(defaults.maxTotalEstimatedCostUsd);

    // The defaults are the model's whole window (992,000 / 8,000 / 1,000,000),
    // so one call's worst case is the whole purse and the per-call ceiling is
    // the purse itself. What keeps a recovery going is that each call is
    // reserved at its own measured size and priced by the provider, under that
    // ceiling (`../llm/harness/run.ts`), and the patch's share is sized on the
    // diagnosis the run already made (`../recovery/annotation/patch-reserve.ts`).
    expect(budget.maxEstimatedCostUsdPerCall).toBe(budget.ledger.maxEstimatedCostUsdPerRun);
    const price = ({ inputTokens, outputTokens }: { inputTokens: number; outputTokens: number }) => estimateAutomationStudioDeepSeekCostUsd(inputTokens, outputTokens);
    // As the harness reserves a call: the build purse's worst-case projection
    // (every input token a cache miss, the whole reply allowance), under the
    // per-call ceiling. One projection prices the ledger and the purse alike.
    const reserved = (inputTokens: number) => Math.min(budget.maxEstimatedCostUsdPerCall, automationStudioLlmProjectedCallCostUsd({ estimateCostUsd: price }, inputTokens, defaults.tokenLimits.maxOutputTokens) ?? budget.maxEstimatedCostUsdPerCall);

    const runBudget = new AutomationStudioLlmRunBudgetLedger(budget.ledger);
    // A whole-page diagnosis: 30,000 tokens measured, 25,000 reported.
    const diagnosis = runBudget.reserve({ runId: "run.one", requestId: "diagnosis", estimatedInputTokens: 30_000, maxOutputTokens: defaults.tokenLimits.maxOutputTokens, maxEstimatedCostUsd: reserved(30_000) });
    expect(diagnosis.ok).toBe(true);
    if (diagnosis.ok) diagnosis.lease.complete({ inputTokens: 25_000, outputTokens: 1_000, totalTokens: 26_000, estimatedCostUsd: price({ inputTokens: 25_000, outputTokens: 1_000 }) });
    holdAutomationStudioRecoveryPatchReserve({
      runBudget,
      runId: "run.one",
      tokenLimits: defaults.tokenLimits,
      maxEstimatedCostUsd: budget.maxEstimatedCostUsdPerCall,
      estimateCostUsd: price
    });
    expect(runBudget.snapshot("run.one").pendingCalls).toBe(1);

    // Each decision reserves its own 30,000-token worst case, then is charged
    // what it reported, as the harness completes every lease with the
    // provider's usage (`../llm/harness/run.ts`). Decisions run one after
    // another, so only the next one's worst case is ever held beside the
    // patch's share -- the same rule the build's decision count follows
    // (`../llm/loop-budget.ts`, t195 F37). Until t229 this loop never completed
    // a lease, so every decision was charged its worst case (~$0.019 here)
    // where live calls cost a quarter of that; at the $0.25 ceiling that still
    // left eight, at $0.10 it left three.
    // What a decision reports: its 30,000 input tokens, 61.8% of them served
    // from DeepSeek's cache as live runs 36-37 measured (t195), and a
    // 1,000-token reply.
    const cacheHits = Math.round(30_000 * 0.618);
    const reported = { inputTokens: 30_000, outputTokens: 1_000, totalTokens: 31_000, estimatedCostUsd: estimateAutomationStudioDeepSeekCostUsd(30_000, 1_000, cacheHits) };
    let decisions = 0;
    let refusal: string | undefined;
    while (decisions < AUTOMATION_STUDIO_EXPLORATION_BUDGET_DEFAULTS.maxProviderCalls) {
      const reservation = runBudget.reserve({
        runId: "run.one",
        requestId: `exploration.${decisions}`,
        estimatedInputTokens: 30_000,
        maxOutputTokens: defaults.tokenLimits.maxOutputTokens,
        maxEstimatedCostUsd: reserved(30_000),
        allowance: "exploration"
      });
      if (!reservation.ok) {
        refusal = reservation.diagnostic.code;
        break;
      }
      reservation.lease.complete(reported);
      decisions += 1;
    }
    expect(decisions).toBeGreaterThanOrEqual(8);
    // The ceiling is still the stop. A decision is refused on the cost code
    // the moment its worst case would eat into the patch's share, which is
    // still held, and what the run spent never passes the ceiling.
    const spent = runBudget.snapshot("run.one");
    if (refusal !== undefined) expect(refusal).toBe("llm_budget.run_cost_limit");
    expect(spent.pendingCalls).toBe(1);
    expect(spent.budgetBreaches).toBe(0);
    expect(spent.estimatedCostUsd).toBeLessThan(budget.ledger.maxEstimatedCostUsdPerRun);
  });

  // Twenty-six calls at a few seconds each is longer than two minutes, so a
  // two-minute clock would quietly have been the new call cap.
  it("gives a recovery ten minutes by default, and an exploration the same clock", () => {
    expect(AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_MS).toBe(600_000);
    expect(AUTOMATION_STUDIO_EXPLORATION_BUDGET_DEFAULTS.maxDurationMs).toBe(AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_MS);
  });
});
