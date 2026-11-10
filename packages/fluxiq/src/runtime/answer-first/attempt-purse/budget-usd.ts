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
//
// **A caller's own budget replaces the default** (`callerUsd`, a FluxNode's `budgetUsd`;
// fluxnode-plan N5): it may be above $5 or below it, and 0 means nothing may be spent. It is the
// only thing that can raise the purse, and only the default gives way to it: the Lab's ceiling and
// a Flow's chosen limit still hold it lower. One that is not a finite amount of at least 0 is no
// budget at all, and the default stands.

import { resolveAutomationStudioLlmTestRunCostCeilingUsd } from "../../../flows/authoring/model/index.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_DEFAULT_BUDGET_USD } from "./default-budget.ts";

export function automationStudioAnswerFirstBudgetUsd(input: { flowSetting?: number | undefined; callerUsd?: number | undefined; env?: Readonly<Record<string, string | undefined>> | undefined } = {}): number {
  const limits: number[] = [amount(input.callerUsd) ?? AUTOMATION_STUDIO_ANSWER_FIRST_DEFAULT_BUDGET_USD];
  const lab = resolveAutomationStudioLlmTestRunCostCeilingUsd(input.env);
  if (lab !== undefined) limits.push(lab);
  const setting = amount(input.flowSetting);
  if (setting !== undefined) limits.push(setting);
  return Math.min(...limits);
}

function amount(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}
