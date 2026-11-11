// A call is measured, held, charged, sent and recorded by the model that serves it (W3, t899): a run
// may give each role a model of its own (`../`), and a provider is bound to one model,
// so the harness asks the provider it was given which one serves the request (`servedBy`) before it
// measures or prices anything. The judging reserve the purse keeps back is priced at the judge's model.
import { describe, expect, it } from "vitest";
import { AutomationStudioLlmBuildPurse, automationStudioLlmBuildPurseScope } from "../../build-purse/index.ts";
import { AutomationStudioLlmProviderRetryLedger } from "../../provider-retry/index.ts";
import { runAutomationStudioLlmHarness, type AutomationStudioLlmHarnessInput, type AutomationStudioLlmProvider, type AutomationStudioLlmTaskResult } from "../../harness/index.ts";
import { AutomationStudioLlmRunBudgetLedger } from "../../run-budget.ts";
import { automationStudioLlmProviderRoutedByRole } from "../index.ts";

const RUN = "run.served";
/** Each model's price per token, input and output alike, and what it says a request measures. */
const MODELS = { cheap: { perToken: 0.000_001, measures: 100 }, dear: { perToken: 0.000_1, measures: 300 } } as const;
type Model = keyof typeof MODELS;
const REPLY = { kind: "diagnosis", summary: "The step's target moved.", confidence: 0.8 };

function model(name: Model, sent: string[]): AutomationStudioLlmProvider {
  const { perToken, measures } = MODELS[name];
  return {
    metadata: { provider: "mock", model: name },
    measureInput: () => ({ estimatedInputTokens: measures, estimatedInputBytes: measures * 3 }),
    estimateCostUsd: ({ inputTokens, outputTokens }) => (inputTokens + outputTokens) * perToken,
    runTask: async (request) => {
      sent.push(`${name}:${request.taskKind}`);
      return { response: REPLY, usage: { inputTokens: measures, outputTokens: 10, totalTokens: measures + 10, estimatedCostUsd: (measures + 10) * perToken } };
    }
  };
}

function harness(input: Partial<AutomationStudioLlmHarnessInput>): Promise<AutomationStudioLlmTaskResult> {
  return runAutomationStudioLlmHarness({
    taskKind: "runtime_diagnosis",
    projectId: "project.llm",
    flowId: "flow.checkout",
    runId: RUN,
    instructions: [],
    tokenLimits: { maxInputTokens: 8_000, maxOutputTokens: 2_000, maxTotalTokens: 10_000 },
    maxEstimatedCostUsd: 1,
    ...input,
    providerRetry: { wait: async () => {}, ledger: new AutomationStudioLlmProviderRetryLedger() }
  });
}

function runBudget(): AutomationStudioLlmRunBudgetLedger {
  return new AutomationStudioLlmRunBudgetLedger({ maxCallsPerRun: 8, maxTotalTokensPerRun: 100_000, maxOutputTokensPerRun: 100_000, maxEstimatedCostUsdPerRun: 5 });
}

describe("a call routed by role", () => {
  it("is sent to, measured, held, charged and recorded at the model that serves it", async () => {
    const sent: string[] = [];
    const provider = automationStudioLlmProviderRoutedByRole({ explore: model("cheap", sent), repair: model("dear", sent) });
    const ledger = runBudget();
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 5 });

    const result = await automationStudioLlmBuildPurseScope(purse, () => harness({ provider, runBudget: ledger }));

    expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
    expect(sent).toEqual(["dear:runtime_diagnosis"]);
    expect(result.provider).toEqual({ provider: "mock", model: "dear" });
    expect(result.intervention.model).toBe("dear");
    // Measured by the model that serves it, and held at its price for that measure and the reply's reserve.
    expect(result.request.estimatedInputTokens).toBe(MODELS.dear.measures);
    expect(purse.lastProjectedCostUsd).toBeCloseTo((MODELS.dear.measures + 2_000) * MODELS.dear.perToken, 12);
    // Charged what it reported costing, on the run's receipt under its own model.
    expect(purse.spentUsd()).toBeCloseTo((MODELS.dear.measures + 10) * MODELS.dear.perToken, 12);
    expect(ledger.snapshot(RUN).estimatedCostUsd).toBeCloseTo((MODELS.dear.measures + 10) * MODELS.dear.perToken, 12);
    expect(ledger.callRecords(RUN).calls[0]).toMatchObject({ model: "dear", provider: "mock", taskKind: "runtime_diagnosis" });
  });

  it("prices one attempt's calls each at its own model, under the one purse", async () => {
    const sent: string[] = [];
    const provider = automationStudioLlmProviderRoutedByRole({ explore: model("cheap", sent), judge: model("dear", sent) });
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 5 });

    await automationStudioLlmBuildPurseScope(purse, async () => {
      await harness({ provider, requestId: "r1" });
      await harness({ provider, requestId: "r2", taskKind: "runtime_patch" });
    });

    expect(sent).toEqual(["cheap:runtime_diagnosis", "cheap:runtime_patch"]);
    expect(purse.spentUsd()).toBeCloseTo(2 * (MODELS.cheap.measures + 10) * MODELS.cheap.perToken, 12);
  });

  it("keeps the judging reserve back at the judge's model's price before any judge has been priced", async () => {
    const sent: string[] = [];
    const routed = automationStudioLlmProviderRoutedByRole({ explore: model("cheap", sent), judge: model("dear", sent) });
    const unpriced = { inputTokens: 1_000, outputTokens: 100 };
    const reserveAfterOneCall = async (provider: AutomationStudioLlmProvider): Promise<number | undefined> => {
      const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 5 });
      purse.keepBackForJudging({ calls: 1, unpriced });
      await automationStudioLlmBuildPurseScope(purse, () => harness({ provider }));
      return purse.judgingHoldUsd();
    };

    expect(await reserveAfterOneCall(routed)).toBeCloseTo(1_100 * MODELS.dear.perToken, 12);
    // A provider that routes nothing prices the reserve at its own model, as before.
    expect(await reserveAfterOneCall(model("cheap", sent))).toBeCloseTo(1_100 * MODELS.cheap.perToken, 12);
  });

  it("sends a provider that routes nothing exactly what it sent before", async () => {
    const sent: string[] = [];
    const explore = model("cheap", sent);
    expect(automationStudioLlmProviderRoutedByRole({ explore })).toBe(explore);
    expect(automationStudioLlmProviderRoutedByRole({ explore, judge: explore, repair: explore })).toBe(explore);
    const result = await harness({ provider: explore });
    expect(result.provider).toEqual({ provider: "mock", model: "cheap" });
    expect(sent).toEqual(["cheap:runtime_diagnosis"]);
  });
});
