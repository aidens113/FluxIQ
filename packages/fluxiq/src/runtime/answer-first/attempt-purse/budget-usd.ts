// The dollars one attempt may spend: the $5 default, held lower by anything
// explicit. Three things are explicit: the Lab-scoped ceiling (only read when
// FLUXIQ_LLM_RUN_COST_CEILING_SCOPE=test, as `resolveAutomationStudioLlmTestRunCostCeilingUsd`
// decides), the resolver's own total (`../../../framework/automation-service/service/answer-first/attempt/ceiling.ts`),
// and a Flow's limit that a person meant (`flowSetting`).
//
// `flowSetting` is only ever an explicit limit: the caller passes
// `automationStudioAnswerFirstExplicitLimitUsd(flowSettings)`, which answers nothing for the
// $0.25 that new Flows store as a default unless a person marked it chosen
// (`cost-limit-chosen-key.ts`). So a deliberate $0.25 holds at $0.25, and the stored default
// does not hold every attempt to a quarter of a dollar. A higher explicit value does not raise
// the $5 default.

import { resolveAutomationStudioLlmTestRunCostCeilingUsd } from "../../../flows/authoring/model/index.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_DEFAULT_BUDGET_USD } from "./default-budget.ts";

export function automationStudioAnswerFirstBudgetUsd(input: { flowSetting?: number | undefined; env?: Readonly<Record<string, string | undefined>> | undefined } = {}): number {
  const limits: number[] = [AUTOMATION_STUDIO_ANSWER_FIRST_DEFAULT_BUDGET_USD];
  const lab = resolveAutomationStudioLlmTestRunCostCeilingUsd(input.env);
  if (lab !== undefined) limits.push(lab);
  const setting = input.flowSetting;
  if (typeof setting === "number" && Number.isFinite(setting) && setting >= 0) limits.push(setting);
  return Math.min(...limits);
}
