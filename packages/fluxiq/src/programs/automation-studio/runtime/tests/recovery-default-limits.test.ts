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
  AUTOMATION_STUDIO_SESSION_KEY_PROVIDER_DEFAULTS,
  AutomationStudioLlmRunBudgetLedger
} from "../llm/index.ts";
import {
  AUTOMATION_STUDIO_EXPLORATION_BUDGET_DEFAULTS,
  AUTOMATION_STUDIO_RECOVERY_BUDGET_SHARES,
  AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_MS,
  AUTOMATION_STUDIO_RECOVERY_MAX_ESTIMATED_COST_USD_PER_RUN,
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
    expect(defaults.maxTotalEstimatedCostUsd).toBeLessThanOrEqual(AUTOMATION_STUDIO_RECOVERY_MAX_ESTIMATED_COST_USD_PER_RUN);

    const budget = resolveAutomationStudioRecoveryRunBudget({
      explicitRunBudget: true,
      resolution: {
        tokenLimits: defaults.tokenLimits,
        maxEstimatedCostUsd: defaults.maxEstimatedCostUsd,
        maxTotalEstimatedCostUsd: defaults.maxTotalEstimatedCostUsd
      }
    });
    expect(budget.ledger.maxEstimatedCostUsdPerRun).toBe(defaults.maxTotalEstimatedCostUsd);

    const runBudget = new AutomationStudioLlmRunBudgetLedger(budget.ledger);
    holdAutomationStudioRecoveryPatchReserve({
      runBudget,
      runId: "run.one",
      tokenLimits: defaults.tokenLimits,
      maxEstimatedCostUsd: budget.maxEstimatedCostUsdPerCall
    });

    // Each decision reserves a whole call's worst case, which is what the
    // exploration is allowed to spend; the ledger refuses the one that would
    // eat into the patch's share.
    let decisions = 0;
    while (decisions < AUTOMATION_STUDIO_EXPLORATION_BUDGET_DEFAULTS.maxProviderCalls) {
      const reservation = runBudget.reserve({
        runId: "run.one",
        requestId: `exploration.${decisions}`,
        estimatedInputTokens: defaults.tokenLimits.maxInputTokens,
        maxOutputTokens: defaults.tokenLimits.maxOutputTokens,
        maxEstimatedCostUsd: budget.maxEstimatedCostUsdPerCall,
        allowance: "exploration"
      });
      if (!reservation.ok) break;
      decisions += 1;
    }
    // Every share of the pot but the one held for the patch.
    expect(decisions).toBe(AUTOMATION_STUDIO_RECOVERY_BUDGET_SHARES - 1);
  });

  // Twenty-six calls at a few seconds each is longer than two minutes, so a
  // two-minute clock would quietly have been the new call cap.
  it("gives a recovery ten minutes by default, and an exploration the same clock", () => {
    expect(AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_MS).toBe(600_000);
    expect(AUTOMATION_STUDIO_EXPLORATION_BUDGET_DEFAULTS.maxDurationMs).toBe(AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_MS);
  });
});
