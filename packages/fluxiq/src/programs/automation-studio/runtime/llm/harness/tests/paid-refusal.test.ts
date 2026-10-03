// A call whose reply Core refused is charged what the provider said it cost,
// never its hold.
//
// `run-muqiojz4-04a7a8fc` step 0108: a runtime_patch call came back 200 with
// 14,335 input tokens (1,280 cached) and 187 output tokens, about $0.0041, and
// was refused as `llm.provider_output_invalid`. The run's ledger and the build's
// purse both charged it at its hold, about $0.0144, because only a malformed
// reply carried its cost out of the adapter. The same held for a result the
// harness could not parse at all: the call had answered, with its usage, and
// was charged as though it had reported nothing.

import { describe, expect, it } from "vitest";
import { AutomationStudioLlmBuildPurse, automationStudioLlmBuildPurseScope } from "../../build-purse/index.ts";
import { AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL, createAutomationStudioDeepSeekProvider, estimateAutomationStudioDeepSeekCostUsd } from "../../deepseek/index.ts";
import { AutomationStudioLlmProviderRetryLedger } from "../../provider-retry/index.ts";
import { AutomationStudioLlmRunBudgetLedger } from "../../run-budget.ts";
import type { AutomationStudioLlmProvider } from "../provider.ts";
import { runAutomationStudioLlmHarness } from "../run.ts";
import type { AutomationStudioLlmHarnessInput, AutomationStudioLlmTaskResult } from "../task-request.ts";

/** A peak instant, Wednesday 2026-09-30 02:00 UTC: DeepSeek bills calls at their send time, peak or off-peak (t254), and these figures are peak. */
const PEAK_CLOCK = (): number => Date.UTC(2026, 8, 30, 2);

const RUN = "run.paid";
/** Step 0108's figures, scaled into this test's token limits. */
const USAGE = { prompt_tokens: 1_433, completion_tokens: 187, total_tokens: 1_620, prompt_cache_hit_tokens: 1_280, prompt_cache_miss_tokens: 153 };
const COST_USD = estimateAutomationStudioDeepSeekCostUsd(1_433, 187, 1_280, AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL);
/** A runtime diagnosis that answered with something else: well-formed JSON, the wrong answer. */
const WRONG_ANSWER = JSON.stringify({ kind: "runtime_patch", patches: [] });

describe("what a refused reply is charged", () => {
  it("charges the run's ledger the reported cost of an output_invalid reply, not its reservation", async () => {
    const ledger = runBudget();
    const result = await harness({ provider: deepSeek(WRONG_ANSWER), runBudget: ledger });

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain("llm.provider_output_invalid");
    expect(COST_USD).toBeGreaterThan(0);
    expect(ledger.snapshot(RUN)).toMatchObject({ calls: 1, inputTokens: 1_433, outputTokens: 187, totalTokens: 1_620, pendingCalls: 0 });
    expect(ledger.snapshot(RUN).estimatedCostUsd).toBeCloseTo(COST_USD, 12);
    expect(ledger.callRecords(RUN).calls[0]?.charged).toMatchObject({ tokens: "reported", cost: "reported", estimatedCostUsd: COST_USD });
  });

  it("settles the build's purse at the reported cost of an output_invalid reply, not its hold", async () => {
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 1 });
    const result = await automationStudioLlmBuildPurseScope(purse, () => harness({ provider: deepSeek(WRONG_ANSWER) }));

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain("llm.provider_output_invalid");
    // The hold is the request's measured input all uncached plus its whole reply
    // allowance: well above what the call cost, so the two cannot be confused.
    expect(purse.lastProjectedCostUsd).toBeGreaterThan(COST_USD * 2);
    expect(purse.pendingUsd()).toBe(0);
    expect(purse.spentUsd()).toBeCloseTo(COST_USD, 12);
  });

  it("charges both at the reported usage when the provider's result cannot be parsed", async () => {
    const usage = { inputTokens: 1_433, outputTokens: 187, totalTokens: 1_620, estimatedCostUsd: COST_USD };
    const provider: AutomationStudioLlmProvider = {
      metadata: { provider: "deepseek", model: "deepseek-flash" },
      estimateCostUsd: ({ inputTokens, outputTokens }) => estimateAutomationStudioDeepSeekCostUsd(inputTokens, outputTokens, 0, AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL),
      // A result whose answer throws when it is read: the parse fails, the usage beside it does not.
      runTask: async () => ({ usage, get response(): never { throw new Error("unreadable"); } }) as never
    };
    const ledger = runBudget();
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 1 });
    const result = await automationStudioLlmBuildPurseScope(purse, () => harness({ provider, runBudget: ledger }));

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain("llm_output.invalid_provider_result");
    expect(ledger.snapshot(RUN)).toMatchObject({ calls: 1, inputTokens: 1_433, outputTokens: 187, totalTokens: 1_620 });
    expect(ledger.snapshot(RUN).estimatedCostUsd).toBeCloseTo(COST_USD, 12);
    expect(purse.spentUsd()).toBeCloseTo(COST_USD, 12);
  });
});

function harness(input: Partial<AutomationStudioLlmHarnessInput>): Promise<AutomationStudioLlmTaskResult> {
  return runAutomationStudioLlmHarness({
    taskKind: "runtime_diagnosis",
    projectId: "project.llm",
    flowId: "flow.checkout",
    runId: RUN,
    requestId: "request.paid",
    instructions: [],
    tokenLimits: { maxInputTokens: 8_000, maxOutputTokens: 2_000, maxTotalTokens: 10_000 },
    maxEstimatedCostUsd: 0.1,
    ...input,
    providerRetry: { wait: async () => {}, ledger: new AutomationStudioLlmProviderRetryLedger() }
  });
}

function runBudget(): AutomationStudioLlmRunBudgetLedger {
  return new AutomationStudioLlmRunBudgetLedger({ maxCallsPerRun: 4, maxTotalTokensPerRun: 100_000, maxOutputTokensPerRun: 100_000, maxEstimatedCostUsdPerRun: 1 });
}

/** The real adapter, answering 200 with `content` and step 0108's usage. */
function deepSeek(content: string): AutomationStudioLlmProvider {
  return createAutomationStudioDeepSeekProvider({
    now: PEAK_CLOCK,
    secretReference: { kind: "secret_reference", id: "secret:deepseek" },
    resolveSecret: async () => "test-secret",
    fetchImpl: (async () => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content } }], usage: USAGE }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch
  });
}
