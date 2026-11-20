// A call the provider refused without billing it is charged nothing (t966).
//
// `run-mwodpw10-3d5748ab` attempt 2: three judge calls were refused with HTTP
// 400 and no usage. Both ledgers kept their holds, charging $1.4233 for calls
// that cost $0, and the Flow's purse emptied. Whether the provider reported
// usage decides the charge; `paid-refusal.test.ts` pins the billed side.

import { describe, expect, it } from "vitest";
import { AutomationStudioLlmBuildPurse, automationStudioLlmBuildPurseScope } from "../index.ts";
import { createAutomationStudioDeepSeekProvider } from "../../deepseek/index.ts";
import { AutomationStudioLlmProviderRetryLedger } from "../../provider-retry/index.ts";
import { AutomationStudioLlmRunBudgetLedger } from "../../run-budget.ts";
import { runAutomationStudioLlmHarness, type AutomationStudioLlmHarnessInput, type AutomationStudioLlmProvider, type AutomationStudioLlmTaskResult } from "../../harness/index.ts";

const RUN = "run.unbilled";

describe("what a refused call that reported no usage is charged", () => {
  it("charges the run's ledger and the purse nothing for an HTTP 400 with no usage, then only real usage for later calls", async () => {
    const ledger = new AutomationStudioLlmRunBudgetLedger({ maxCallsPerRun: 8, maxTotalTokensPerRun: 100_000, maxOutputTokensPerRun: 100_000, maxEstimatedCostUsdPerRun: 1 });
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 1 });
    const refused = await automationStudioLlmBuildPurseScope(purse, () => harness("request.refused", refusing(), ledger));

    expect(refused.diagnostics.map((diagnostic) => diagnostic.code)).toContain("llm.provider_http_error");
    // The hold was real, so a charge at the hold would show here.
    expect(purse.lastProjectedCostUsd).toBeGreaterThan(0);
    expect(purse.pendingUsd()).toBe(0);
    expect(purse.spentUsd()).toBe(0);
    expect(ledger.snapshot(RUN)).toMatchObject({ calls: 1, estimatedCostUsd: 0, pendingCalls: 0 });
    expect(ledger.callRecords(RUN).calls[0]?.charged).toMatchObject({ estimatedCostUsd: 0 });

    const real = await automationStudioLlmBuildPurseScope(purse, () => harness("request.real", answering(0.002), ledger));
    expect(real.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain("llm.provider_http_error");
    expect(purse.pendingUsd()).toBe(0);
    expect(purse.spentUsd()).toBeCloseTo(0.002, 12);
    expect(ledger.snapshot(RUN).estimatedCostUsd).toBeCloseTo(0.002, 12);
  });

  it("charges a transport failure with no usage nothing", async () => {
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 1 });
    const provider: AutomationStudioLlmProvider = {
      metadata: { provider: "deepseek", model: "deepseek-flash" },
      estimateCostUsd: () => 0.5,
      runTask: async () => { throw new Error("socket hang up"); }
    };
    await automationStudioLlmBuildPurseScope(purse, () => harness("request.transport", provider));
    expect(purse.pendingUsd()).toBe(0);
    expect(purse.spentUsd()).toBe(0);
  });
});

function harness(requestId: string, provider: AutomationStudioLlmProvider, runBudget?: AutomationStudioLlmRunBudgetLedger): Promise<AutomationStudioLlmTaskResult> {
  const input: Partial<AutomationStudioLlmHarnessInput> = { provider, ...(runBudget ? { runBudget } : {}) };
  return runAutomationStudioLlmHarness({
    taskKind: "runtime_diagnosis",
    projectId: "project.llm",
    flowId: "flow.checkout",
    runId: RUN,
    requestId,
    instructions: [],
    tokenLimits: { maxInputTokens: 8_000, maxOutputTokens: 2_000, maxTotalTokens: 10_000 },
    maxEstimatedCostUsd: 0.1,
    ...input,
    providerRetry: { wait: async () => {}, ledger: new AutomationStudioLlmProviderRetryLedger() }
  });
}

function deepSeek(fetchImpl: typeof fetch): AutomationStudioLlmProvider {
  return createAutomationStudioDeepSeekProvider({
    secretReference: { kind: "secret_reference", id: "secret:deepseek" },
    resolveSecret: async () => "test-secret",
    fetchImpl
  });
}

/** The provider's 400: refused before generation, no usage in the body. */
function refusing(): AutomationStudioLlmProvider {
  return deepSeek((async () => new Response(JSON.stringify({ error: { message: "bad request" } }), { status: 400, headers: { "content-type": "application/json" } })) as typeof fetch);
}

/** A 200 whose usage prices at roughly `costUsd` is not constructible portably, so this answers with a priced provider result instead. */
function answering(costUsd: number): AutomationStudioLlmProvider {
  return {
    metadata: { provider: "deepseek", model: "deepseek-flash" },
    estimateCostUsd: () => costUsd,
    runTask: async () => ({ response: { kind: "diagnosis", summary: "ok" }, usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120, estimatedCostUsd: costUsd } })
  };
}
