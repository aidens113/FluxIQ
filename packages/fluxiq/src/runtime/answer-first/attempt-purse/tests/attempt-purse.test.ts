// The attempt's purse: the $5 default, what an explicit limit does to it, and a
// judge call kept payable when decisions are refused.

import { describe, expect, it } from "vitest";
import { AutomationStudioLlmBuildPurse } from "../../../llm/build-purse/index.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_DEFAULT_BUDGET_USD, automationStudioAnswerFirstBudgetUsd, automationStudioAnswerFirstKeepBackJudge } from "../index.ts";

const lab = (value?: string) => ({ FLUXIQ_LLM_RUN_COST_CEILING_SCOPE: "test", ...(value === undefined ? {} : { FLUXIQ_LLM_RUN_COST_CEILING_USD: value }) });

describe("budget", () => {
  it("is $5 with nothing explicit", () => {
    expect(AUTOMATION_STUDIO_ANSWER_FIRST_DEFAULT_BUDGET_USD).toBe(5);
    expect(automationStudioAnswerFirstBudgetUsd({ env: {} })).toBe(5);
  });
  it("holds an explicit $0.25 Flow setting, as it holds any explicit one", () => {
    expect(automationStudioAnswerFirstBudgetUsd({ flowSetting: 0.25, env: {} })).toBe(0.25);
  });
  it("holds an explicit lower Flow setting", () => {
    expect(automationStudioAnswerFirstBudgetUsd({ flowSetting: 1, env: {} })).toBe(1);
  });
  it("does not raise the default for a higher setting", () => {
    expect(automationStudioAnswerFirstBudgetUsd({ flowSetting: 9, env: {} })).toBe(5);
  });
  it("holds a Lab-scoped ceiling, and its default of $0.10", () => {
    expect(automationStudioAnswerFirstBudgetUsd({ env: lab("0.5") })).toBe(0.5);
    expect(automationStudioAnswerFirstBudgetUsd({ env: lab() })).toBe(0.1);
  });
  it("ignores the ceiling variable outside the test scope", () => {
    expect(automationStudioAnswerFirstBudgetUsd({ env: { FLUXIQ_LLM_RUN_COST_CEILING_USD: "0.5" } })).toBe(5);
  });
  it("takes the lowest of the explicit limits", () => {
    expect(automationStudioAnswerFirstBudgetUsd({ flowSetting: 0.3, env: lab("0.5") })).toBe(0.3);
  });
});

describe("a caller's budget", () => {
  it("replaces the default, above $5 as well as below", () => {
    expect(automationStudioAnswerFirstBudgetUsd({ callerUsd: 12, env: {} })).toBe(12);
    expect(automationStudioAnswerFirstBudgetUsd({ callerUsd: 0.5, env: {} })).toBe(0.5);
    expect(automationStudioAnswerFirstBudgetUsd({ callerUsd: 0, env: {} })).toBe(0);
  });
  it("is still held lower by a Flow's chosen limit and a Lab's ceiling", () => {
    expect(automationStudioAnswerFirstBudgetUsd({ callerUsd: 12, flowSetting: 2, env: {} })).toBe(2);
    expect(automationStudioAnswerFirstBudgetUsd({ callerUsd: 12, env: lab("0.5") })).toBe(0.5);
  });
  it("is no budget when it is not a finite amount of at least 0, and the default stands", () => {
    for (const callerUsd of [Number.NaN, Number.POSITIVE_INFINITY, -1]) expect(automationStudioAnswerFirstBudgetUsd({ callerUsd, env: {} }), String(callerUsd)).toBe(5);
  });
});

describe("judge reserve", () => {
  const price = (inputTokens: number, outputTokens: number) => inputTokens * 1e-6 + outputTokens * 4e-6; // 8,000 in + 1,250 out = $0.013
  const decision = { projectedCostUsd: 0.01, estimatedInputTokens: 100, maxOutputTokens: 750, price };

  it("refuses decisions that would eat the judge's share, and still pays the judge", () => {
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.05 });
    automationStudioAnswerFirstKeepBackJudge(purse);
    const first = purse.hold(decision);
    expect(first.ok).toBe(true);
    if (first.ok) first.hold.settle({ estimatedCostUsd: 0.03 });
    expect(purse.hold(decision).ok).toBe(false);
    expect(purse.judgingHoldUsd()).toBeCloseTo(0.013, 6);
    const judge = purse.hold({ ...decision, projectedCostUsd: 0.012, judge: true });
    expect(judge.ok).toBe(true);
  });

  it("is sized larger for a bigger summary", () => {
    const small = new AutomationStudioLlmBuildPurse({ ceilingUsd: 1 });
    const large = new AutomationStudioLlmBuildPurse({ ceilingUsd: 1 });
    automationStudioAnswerFirstKeepBackJudge(small);
    automationStudioAnswerFirstKeepBackJudge(large, { summaryInputTokens: 30_000 });
    small.hold(decision);
    expect(small.judgingHoldUsd()).toBeCloseTo(0.013, 6);
    large.hold(decision);
    expect(large.judgingHoldUsd()).toBeCloseTo(0.035, 6);
  });
});
