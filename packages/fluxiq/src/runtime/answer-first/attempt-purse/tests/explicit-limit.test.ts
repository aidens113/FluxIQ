// Which Flow limit the attempt's purse honours: the stored $0.25 is the old default unless a person marked it chosen.
import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_COST_LIMIT_CHOSEN_KEY, automationStudioAnswerFirstBudgetUsd, automationStudioAnswerFirstExplicitLimitUsd } from "../index.ts";

const flow = (limit: number, chosen?: boolean) => ({ adaptationPolicySettings: { maxEstimatedCostUsdPerRun: limit, ...(chosen === undefined ? {} : { [AUTOMATION_STUDIO_COST_LIMIT_CHOSEN_KEY]: chosen }) } });
const budget = (settings: Record<string, unknown> | undefined, env: Record<string, string> = {}) => automationStudioAnswerFirstBudgetUsd({ flowSetting: automationStudioAnswerFirstExplicitLimitUsd(settings), env });
const lab = (value: string) => ({ FLUXIQ_LLM_RUN_COST_CEILING_SCOPE: "test", FLUXIQ_LLM_RUN_COST_CEILING_USD: value });

describe("the explicit Flow limit", () => {
  it("reads a stored default $0.25 with no marker as no limit, so the attempt gets $5", () => {
    expect(automationStudioAnswerFirstExplicitLimitUsd(flow(0.25))).toBeUndefined();
    expect(budget(flow(0.25))).toBe(5);
  });
  it("holds a $0.25 a person chose", () => {
    expect(automationStudioAnswerFirstExplicitLimitUsd(flow(0.25, true))).toBe(0.25);
    expect(budget(flow(0.25, true))).toBe(0.25);
  });
  it("holds a person's $1, marked or an older Flow's with no marker", () => {
    expect(budget(flow(1, true))).toBe(1);
    expect(budget(flow(1))).toBe(1);
  });
  it("does not raise the $5 default for a higher limit", () => {
    expect(budget(flow(9, true))).toBe(5);
    expect(budget(flow(9))).toBe(5);
  });
  it("lets the test-scoped ceiling hold lower, written into a Flow or in the environment", () => {
    expect(budget(flow(0.1))).toBe(0.1);
    expect(budget(flow(0.25), lab("0.1"))).toBe(0.1);
    expect(budget(flow(0.25, true), lab("0.1"))).toBe(0.1);
  });
  it("reads a record with no policy, no limit, a false marker or a bad value as no limit", () => {
    expect(automationStudioAnswerFirstExplicitLimitUsd(undefined)).toBeUndefined();
    expect(automationStudioAnswerFirstExplicitLimitUsd({})).toBeUndefined();
    expect(automationStudioAnswerFirstExplicitLimitUsd({ adaptationPolicySettings: { preset: "x" } })).toBeUndefined();
    expect(automationStudioAnswerFirstExplicitLimitUsd(flow(0.25, false))).toBeUndefined();
    expect(automationStudioAnswerFirstExplicitLimitUsd(flow(-1, true))).toBeUndefined();
    expect(automationStudioAnswerFirstExplicitLimitUsd({ adaptationPolicySettings: { maxEstimatedCostUsdPerRun: "1", [AUTOMATION_STUDIO_COST_LIMIT_CHOSEN_KEY]: true } })).toBeUndefined();
  });
});
