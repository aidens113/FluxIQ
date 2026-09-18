// The grant's numbers and the recovery's, held together.
//
// `runtime/llm/` may not import a value out of `runtime/recovery/`, so the
// grant writes its defaults as literals that describe a recovery. This pins
// those literals to the recovery constants they describe, so neither side can
// move without the other noticing.

import { describe, expect, it } from "vitest";
import type { IdentityAccessService } from "../../../identity-access/index.ts";
import type { SecretKeysService } from "../../../secret-keys/index.ts";
import {
  AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_DEFAULT_MAX_CALLS,
  AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_RUN_MS,
  AUTOMATION_STUDIO_LLM_HIGH_TOKEN_CONFIRMATION_THRESHOLD,
  AutomationStudioLlmExecutionGrantService,
  AutomationStudioLlmRunBudgetLedger
} from "../llm/index.ts";
import {
  AUTOMATION_STUDIO_EXPLORATION_BUDGET_DEFAULTS,
  AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_CEILING_MS,
  AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_MS,
  AUTOMATION_STUDIO_RECOVERY_MAX_ESTIMATED_COST_USD_PER_RUN,
  holdAutomationStudioRecoveryPatchReserve,
  resolveAutomationStudioRecoveryRunBudget
} from "../recovery/index.ts";

describe("the limits a default recovery grant and a recovery share", () => {
  // The confirmation threshold is no longer a number written down here to be
  // compared with a number written down there. It is ten full calls, and what
  // those ten have to buy is a diagnosis, a patch, and decisions left over to
  // explore with -- so this walks a default grant through the recovery's own run
  // budget, sets the patch's share aside as a recovery does, and counts the
  // exploration decisions that still fit.
  //
  // That count was ZERO while the threshold was the literal 100_000 beside a
  // 56,000-token call: the pot was under two calls' worth and the patch's
  // reserve held one of them, so every default-grant recovery stopped without
  // exploring. Counting the decisions, rather than pinning the number, is what
  // makes this case notice if the two ever drift apart again.
  it("gives a default grant a diagnosis, a patch and the exploration's own default decisions", async () => {
    expect(AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_DEFAULT_MAX_CALLS).toBe(2 + AUTOMATION_STUDIO_EXPLORATION_BUDGET_DEFAULTS.maxProviderCalls);
    expect(AUTOMATION_STUDIO_RECOVERY_MAX_ESTIMATED_COST_USD_PER_RUN).toBe(2);

    const grant = await defaultAdaptGrantLimits();
    const perCall = grant.tokenLimits.maxTotalTokens;
    expect(AUTOMATION_STUDIO_LLM_HIGH_TOKEN_CONFIRMATION_THRESHOLD).toBe(perCall * 10);
    expect(grant.maxTotalTokensPerRun).toBe(AUTOMATION_STUDIO_LLM_HIGH_TOKEN_CONFIRMATION_THRESHOLD);

    const budget = resolveAutomationStudioRecoveryRunBudget({
      explicitGrantBudget: true,
      resolution: {
        maxCallsPerRun: grant.maxCalls,
        maxTotalTokensPerRun: grant.maxTotalTokensPerRun,
        tokenLimits: grant.tokenLimits,
        maxEstimatedCostUsd: grant.maxEstimatedCostUsd,
        maxTotalEstimatedCostUsd: grant.maxTotalEstimatedCostUsd
      }
    });
    expect(budget.ledger.maxTotalTokensPerRun).toBe(AUTOMATION_STUDIO_LLM_HIGH_TOKEN_CONFIRMATION_THRESHOLD);

    const runBudget = new AutomationStudioLlmRunBudgetLedger(budget.ledger);
    holdAutomationStudioRecoveryPatchReserve({
      runBudget,
      runId: "run.one",
      declaredCallsPerRun: grant.maxCalls,
      tokenLimits: grant.tokenLimits,
      maxEstimatedCostUsd: budget.maxEstimatedCostUsdPerCall
    });

    // Each decision reserves a whole call's worst case, which is what the
    // exploration is allowed to spend; the ledger refuses the one that would
    // eat into the patch's share.
    let decisions = 0;
    while (decisions < AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_DEFAULT_MAX_CALLS) {
      const reservation = runBudget.reserve({
        runId: "run.one",
        requestId: `exploration.${decisions}`,
        estimatedInputTokens: grant.tokenLimits.maxInputTokens,
        maxOutputTokens: grant.tokenLimits.maxOutputTokens,
        maxEstimatedCostUsd: budget.maxEstimatedCostUsdPerCall,
        allowance: "exploration"
      });
      if (!reservation.ok) break;
      decisions += 1;
    }
    expect(decisions).toBeGreaterThan(0);
    // Ten calls in the pot, one of them held for the patch.
    expect(decisions).toBe(AUTOMATION_STUDIO_LLM_HIGH_TOKEN_CONFIRMATION_THRESHOLD / perCall - 1);
  });

  // The recovery clock starts before the grant is claimed, so a lease at least
  // as long as the longest recovery means the recovery's own deadline is what
  // ends a recovery; the lease only ends a claimed grant nobody released.
  it("keeps a claimed grant's lease at least as long as the longest recovery", () => {
    expect(AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_RUN_MS).toBeGreaterThanOrEqual(AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_CEILING_MS);
    expect(AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_CEILING_MS).toBeGreaterThanOrEqual(AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_MS);
  });

  // Twenty-six calls at a few seconds each is longer than two minutes, so a
  // two-minute clock would quietly have been the new call cap.
  it("gives a recovery ten minutes by default, and an exploration the same clock", () => {
    expect(AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_MS).toBe(600_000);
    expect(AUTOMATION_STUDIO_EXPLORATION_BUDGET_DEFAULTS.maxDurationMs).toBe(AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_MS);
  });
});

/** What a person gets when they authorize an adaptation and name no numbers,
 * from the real grant service. A preflight needs an enabled DeepSeek key and a
 * Flow bound to a settings revision, and touches nothing else. */
async function defaultAdaptGrantLimits() {
  const key = { id: "secret:key", name: "DeepSeek", kind: "llm", provider: "deepseek", scope: "global", enabled: true, createdAtMs: 1, updatedAtMs: 1, lastRotatedAtMs: 1, metadata: { model: "deepseek-chat" } };
  const service = new AutomationStudioLlmExecutionGrantService({
    identityAccess: {} as IdentityAccessService,
    secretKeys: { getKeySummary: async (id: string) => (id === key.id ? key : undefined) } as unknown as SecretKeysService,
    resolveExecutionDigest: async () => ({ executionDigest: "execution-digest.one", settingsRevision: 1 })
  });
  return service.preflight({ keyId: key.id, projectId: "project.one", flowId: "flow.one", purpose: "diagnose_and_adapt" });
}
