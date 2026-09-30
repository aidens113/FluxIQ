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
    const reserved = (inputTokens: number) => Math.min(budget.maxEstimatedCostUsdPerCall, price({ inputTokens, outputTokens: defaults.tokenLimits.maxOutputTokens }));

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

    // Each decision reserves its own 30,000-token worst case; the ledger
    // refuses the one that would eat into the patch's share.
    let decisions = 0;
    while (decisions < AUTOMATION_STUDIO_EXPLORATION_BUDGET_DEFAULTS.maxProviderCalls) {
      const reservation = runBudget.reserve({
        runId: "run.one",
        requestId: `exploration.${decisions}`,
        estimatedInputTokens: 30_000,
        maxOutputTokens: defaults.tokenLimits.maxOutputTokens,
        maxEstimatedCostUsd: reserved(30_000),
        allowance: "exploration"
      });
      if (!reservation.ok) break;
      decisions += 1;
    }
    expect(decisions).toBeGreaterThanOrEqual(8);
  });

  // Twenty-six calls at a few seconds each is longer than two minutes, so a
  // two-minute clock would quietly have been the new call cap.
  it("gives a recovery ten minutes by default, and an exploration the same clock", () => {
    expect(AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_MS).toBe(600_000);
    expect(AUTOMATION_STUDIO_EXPLORATION_BUDGET_DEFAULTS.maxDurationMs).toBe(AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_MS);
  });
});
