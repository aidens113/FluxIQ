// A request's size, measured once and the same way everywhere, and what the
// run's ledger is charged for it.
//
// 2026-09-30: the model is shown the whole page, and the only bound on a
// request is the model's 1,000,000-token window. Two defects followed from the
// harness and the DeepSeek adapter each measuring a request their own way
// (characters / 4 against UTF-8 bytes / 3): a request of about 3-4 MB passed
// the harness and was refused by the adapter, and the stored failure lost its
// size. And the ledger reserved every call at its token limit -- now the whole
// window -- so at the window profile one call held the whole $0.25 purse.

import { describe, expect, it } from "vitest";
import { createAutomationStudioDeepSeekProvider, estimateAutomationStudioDeepSeekCostUsd } from "../../deepseek/index.ts";
import { AutomationStudioLlmProviderError, normalizedAutomationStudioLlmProviderFailure } from "../../provider-contract.ts";
import { AutomationStudioLlmProviderRetryLedger } from "../../provider-retry/index.ts";
import { AutomationStudioLlmRunBudgetLedger } from "../../run-budget.ts";
import { AUTOMATION_STUDIO_LLM_BUILD_CALL_RESERVES, AutomationStudioLlmBuildPurse, automationStudioLlmBuildPurseScope } from "../../build-purse/index.ts";
import type { AutomationStudioLlmProvider } from "../provider.ts";
import { runAutomationStudioLlmHarness } from "../run.ts";
import type { AutomationStudioLlmHarnessInput, AutomationStudioLlmTaskRequest, AutomationStudioLlmTaskResult } from "../task-request.ts";

const WINDOW = { maxInputTokens: 992_000, maxOutputTokens: 8_000, maxTotalTokens: 1_000_000 };
const ANSWER = { response: { kind: "diagnosis", summary: "The control moved." } };

describe("the harness's measure of a request", () => {
  it("is the adapter's own measure, so a request the adapter would refuse is refused first, by the harness, with its size", async () => {
    let sent = 0;
    const deepseek = createAutomationStudioDeepSeekProvider({
      secretReference: { kind: "secret_reference", id: "secret:deepseek" },
      resolveSecret: async () => "test-secret",
      fetchImpl: (async () => { sent += 1; throw new Error("transport must not run"); }) as typeof fetch
    });
    // Measured on the packed request alone, this passes its limit: the
    // adapter's system prompt and output schema are what push it over. The
    // limit is set one below the adapter's measure of the same request (both
    // three digits, so the limit written into the request does not move it).
    const probe = await harness({ provider: { ...deepseek, runTask: async () => ANSWER }, tokenLimits: { maxInputTokens: 999, maxOutputTokens: 2_000, maxTotalTokens: 10_000 } });
    const limits = { maxInputTokens: deepseek.measureInput!(probe.request).estimatedInputTokens - 1, maxOutputTokens: 2_000, maxTotalTokens: 10_000 };
    const refused = await harness({ provider: deepseek, tokenLimits: limits });
    const packedOnly = Math.ceil(Buffer.byteLength(JSON.stringify({ ...refused.request, estimatedInputTokens: 0 }), "utf8") / 3);
    const measured = deepseek.measureInput!(refused.request);
    expect(packedOnly).toBeLessThanOrEqual(limits.maxInputTokens);
    expect(measured.estimatedInputTokens).toBeGreaterThan(limits.maxInputTokens);
    expect(refused.request.estimatedInputTokens).toBe(measured.estimatedInputTokens);
    expect(sent).toBe(0);
    expect(refused.providerInvocation).toBe("not_attempted");
    const diagnostic = refused.diagnostics.find((entry) => entry.code === "llm_budget.input_limit_exceeded");
    expect(diagnostic?.message).toContain(`${measured.estimatedInputTokens} input tokens (${measured.estimatedInputBytes} bytes)`);
    expect(diagnostic?.metadata).toMatchObject({ estimatedInputTokens: measured.estimatedInputTokens, estimatedInputBytes: measured.estimatedInputBytes });
    expect(refused.diagnostics.map((entry) => entry.code)).not.toContain("llm.provider_input_budget_exceeded");
  });

  it("uses UTF-8 bytes / 3 for a provider that does not say how it measures", async () => {
    let seen: AutomationStudioLlmTaskRequest | undefined;
    const result = await harness({ provider: { metadata: { provider: "mock", model: "plain" }, runTask: async (request) => { seen = request; return ANSWER; } } });
    expect(result.ok).toBe(true);
    const packed = JSON.stringify({ ...seen!, estimatedInputTokens: 0, deniedEvidenceKeys: undefined });
    expect(seen!.estimatedInputTokens).toBe(Math.ceil(Buffer.byteLength(packed, "utf8") / 3));
  });

  it("falls back to the packed measure when a provider's measure throws", async () => {
    const result = await harness({ provider: { metadata: { provider: "mock", model: "plain" }, measureInput: () => { throw new Error("no"); }, runTask: async () => ANSWER } });
    expect(result.ok).toBe(true);
    expect(result.request.estimatedInputTokens).toBeGreaterThan(0);
  });
});

describe("the adapter's own refusal of an oversize request", () => {
  it("carries the size into the normalized failure, the harness diagnostic and nothing else", async () => {
    const inputSize = { estimatedInputTokens: 1_200_000, estimatedInputBytes: 3_600_000, maxInputTokens: 992_000, maxOutputTokens: 8_000, maxTotalTokens: 1_000_000, contextWindowTokens: 1_000_000 };
    const error = new AutomationStudioLlmProviderError("llm.provider_input_budget_exceeded", "raw check wording", false, undefined, undefined, undefined, undefined, undefined, inputSize);
    const failure = normalizedAutomationStudioLlmProviderFailure(error);
    expect(failure.inputSize).toEqual(inputSize);
    expect(failure.message).toContain("1200000 input tokens (3600000 bytes)");
    expect(failure.message).toContain("context window is 1000000 tokens");
    expect(failure.message).not.toContain("raw check wording");

    // A provider without a measure: the adapter's refusal is the one that fires.
    const provider: AutomationStudioLlmProvider = { metadata: { provider: "deepseek", model: "deepseek-flash" }, runTask: async () => { throw error; } };
    const result = await harness({ provider });
    const diagnostic = result.diagnostics.find((entry) => entry.code === "llm.provider_input_budget_exceeded");
    expect(diagnostic?.message).toContain("1200000 input tokens (3600000 bytes)");
    expect(diagnostic?.metadata).toMatchObject({ inputSize });
  });

  it("keeps the one safe sentence for every other pre-flight refusal, and for a size that is not numbers", () => {
    expect(normalizedAutomationStudioLlmProviderFailure(new AutomationStudioLlmProviderError("llm.provider_request_limits_invalid", "raw")).message).toBe("The LLM provider refused the request before sending it.");
    const bad = new AutomationStudioLlmProviderError("llm.provider_input_budget_exceeded", "raw", false, undefined, undefined, undefined, undefined, { estimatedInputTokens: "PRIVATE" } as never);
    const failure = normalizedAutomationStudioLlmProviderFailure(bad);
    expect(failure.message).toBe("The LLM provider refused the request before sending it.");
    expect(failure).not.toHaveProperty("inputSize");
  });
});

describe("what the run's ledger is charged for a call", () => {
  const priced: Pick<AutomationStudioLlmProvider, "measureInput" | "estimateCostUsd"> = {
    // A 30,000-token build call, as the adapter would measure it.
    measureInput: () => ({ estimatedInputTokens: 30_000, estimatedInputBytes: 90_000 }),
    estimateCostUsd: ({ inputTokens, outputTokens }) => estimateAutomationStudioDeepSeekCostUsd(inputTokens, outputTokens, 0, "deepseek-flash")
  };

  it("reserves the request's own size and price, so a 30,000-token call passes the per-call cost check under $0.25 at the window profile", async () => {
    const ledger = new AutomationStudioLlmRunBudgetLedger({ maxTotalTokensPerRun: 24_000_000, maxOutputTokensPerRun: 24_000_000, maxEstimatedCostUsdPerRun: 0.25 });
    // Already $0.20 spent: a window-sized reservation ($0.25) could not be
    // admitted, and a 30,000-token call's own ($0.0186) can.
    const spent = ledger.reserve({ runId: "run.window", requestId: "earlier", estimatedInputTokens: 1, maxOutputTokens: 1, maxEstimatedCostUsd: 0.2 });
    if (spent.ok) spent.lease.complete({ inputTokens: 1, outputTokens: 0, totalTokens: 1, estimatedCostUsd: 0.2 });
    let pending: ReturnType<AutomationStudioLlmRunBudgetLedger["snapshot"]> | undefined;
    const provider: AutomationStudioLlmProvider = {
      metadata: { provider: "deepseek", model: "deepseek-flash" },
      ...priced,
      runTask: async () => { pending = ledger.snapshot("run.window"); return { ...ANSWER, usage: { inputTokens: 28_000, outputTokens: 900, totalTokens: 28_900, estimatedCostUsd: estimateAutomationStudioDeepSeekCostUsd(28_000, 900, 0, "deepseek-flash") } }; }
    };
    const result = await harness({ provider, runBudget: ledger, runId: "run.window", tokenLimits: WINDOW, maxEstimatedCostUsd: 0.25 });

    expect(result.ok).toBe(true);
    expect(result.request.estimatedInputTokens).toBe(30_000);
    expect(pending?.pendingCalls).toBe(1);
    const [, call] = ledger.callRecords("run.window").calls;
    expect(call?.charged).toMatchObject({ inputTokens: 28_000, tokens: "reported", cost: "reported" });
    expect(ledger.snapshot("run.window")).toMatchObject({ calls: 2, budgetBreaches: 0 });
    // The reservation the harness made: its own size plus the reply's allowance.
    expect(estimateAutomationStudioDeepSeekCostUsd(30_000, WINDOW.maxOutputTokens, 0, "deepseek-flash")).toBeLessThan(0.05);
  });

  it("reserves input tokens at the request's size, not its window-sized limit", async () => {
    // A pot of 100,000 tokens: a window-sized reservation (1,000,000) is refused outright.
    const ledger = new AutomationStudioLlmRunBudgetLedger({ maxTotalTokensPerRun: 100_000, maxOutputTokensPerRun: 100_000, maxEstimatedCostUsdPerRun: 0.25 });
    const provider: AutomationStudioLlmProvider = { metadata: { provider: "deepseek", model: "deepseek-flash" }, ...priced, runTask: async () => ANSWER };
    const first = await harness({ provider, runBudget: ledger, runId: "run.pot", requestId: "request.one", tokenLimits: WINDOW, maxEstimatedCostUsd: 0.25 });
    const second = await harness({ provider, runBudget: ledger, runId: "run.pot", requestId: "request.two", tokenLimits: WINDOW, maxEstimatedCostUsd: 0.25 });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(ledger.snapshot("run.pot").calls).toBe(2);
  });

  it("holds a provider that does not price at the call's ceiling, as before", async () => {
    const ledger = new AutomationStudioLlmRunBudgetLedger({ maxTotalTokensPerRun: 100_000, maxOutputTokensPerRun: 100_000, maxEstimatedCostUsdPerRun: 0.25 });
    let pendingCost = 0;
    const provider: AutomationStudioLlmProvider = { metadata: { provider: "mock", model: "plain" }, runTask: async () => { pendingCost = ledger.snapshot("run.plain").estimatedCostUsd; return ANSWER; } };
    const result = await harness({ provider, runBudget: ledger, runId: "run.plain", maxEstimatedCostUsd: 0.1 });
    expect(result.ok).toBe(true);
    expect(pendingCost).toBe(0);
    // Charged the reservation, because the provider reported no cost.
    expect(ledger.snapshot("run.plain").estimatedCostUsd).toBeCloseTo(0.1, 9);
  });
});

function harness(input: Partial<AutomationStudioLlmHarnessInput>): Promise<AutomationStudioLlmTaskResult> {
  return runAutomationStudioLlmHarness({
    taskKind: "runtime_diagnosis",
    projectId: "project.llm",
    flowId: "flow.checkout",
    runId: "run.size",
    requestId: "request.size",
    instructions: [],
    tokenLimits: { maxInputTokens: 8_000, maxOutputTokens: 2_000, maxTotalTokens: 10_000 },
    maxEstimatedCostUsd: 0.1,
    ...input,
    providerRetry: { wait: async () => {}, ledger: new AutomationStudioLlmProviderRetryLedger(), ...input.providerRetry }
  });
}

// t254: a build call is priced at what it sends, never the packed request, and
// its reply is held at the largest reply observed for its kind, never capped.
describe("what a build's purse holds a call at (t254)", () => {
  /** DeepSeek flash's peak rates, every input token a miss. */
  const flash = (inputTokens: number, outputTokens: number) => (inputTokens * 0.3 + outputTokens * 1.2) / 1_000_000;
  const held: Array<{ inputTokens: number; outputTokens: number }> = [];
  /** A provider whose sent messages measure 1,000 tokens, far under the packed request carrying a long instruction. */
  const sendsLittle = (): AutomationStudioLlmProvider => ({
    metadata: { provider: "deepseek", model: "deepseek-flash" },
    measureInput: () => ({ estimatedInputTokens: 1_000, estimatedInputBytes: 3_000 }),
    estimateCostUsd: ({ inputTokens, outputTokens }) => { held.push({ inputTokens, outputTokens }); return flash(inputTokens, outputTokens); },
    runTask: async () => ANSWER
  });
  const longInstruction = [{ schemaVersion: "0.1" as const, instructionId: "instruction.long", title: "Long", body: "word ".repeat(30_000), scope: { kind: "flow" as const, projectId: "project.llm", flowId: "flow.checkout" }, priority: 100, status: "active" as const, requirement: "required" as const, createdAt: 1, updatedAt: 1 }];

  it("prices what the provider sends, and keeps the packed request for the window refusal alone", async () => {
    held.length = 0;
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
    const result = await automationStudioLlmBuildPurseScope(purse, () => harness({ provider: sendsLittle(), instructions: longInstruction as never, tokenLimits: WINDOW }));

    expect(result.ok).toBe(true);
    // The size the window refusal reads is the packed request, the larger measure.
    expect(result.request.estimatedInputTokens).toBeGreaterThan(10_000);
    // The purse held what is sent: 1,000 tokens, not the packed request's.
    expect(held[0]?.inputTokens).toBe(1_000);
    expect(purse.lastProjectedCostUsd).toBeCloseTo(flash(1_000, WINDOW.maxOutputTokens), 12);
  });

  it("holds a decision's reply at 750 tokens and a judge's at 1,250, twice the largest each has sent, and another kind at its window set-aside", async () => {
    const replies = async (taskKind: AutomationStudioLlmHarnessInput["taskKind"]) => {
      held.length = 0;
      const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
      await automationStudioLlmBuildPurseScope(purse, () => harness({ taskKind, provider: { ...sendsLittle(), runTask: async () => ({ response: { kind: "diagnosis", summary: "Judged." } }) }, tokenLimits: WINDOW, ...(taskKind === "evidence_tool_decision" ? { evidenceLoop: { iteration: 1, tools: [], evidence: [], decisionSchema: { type: "object" }, completionSchema: { type: "object" }, canComplete: true } } : {}) }));
      return held[0]?.outputTokens;
    };
    expect(await replies("evidence_tool_decision")).toBe(750);
    expect(await replies("loop_verification")).toBe(1_250);
    expect(await replies("runtime_diagnosis")).toBe(WINDOW.maxOutputTokens);
    expect(AUTOMATION_STUDIO_LLM_BUILD_CALL_RESERVES).toEqual({ decisionReplyTokens: 750, judgeReplyTokens: 1_250, judgeInputTokens: 8_000 });
  });
});
