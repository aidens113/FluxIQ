// The dollars one attempt may spend: the $5 default, held lower by anything
// explicit. Two things are explicit: the Lab-scoped ceiling (only read when
// FLUXIQ_LLM_RUN_COST_CEILING_SCOPE=test, as `resolveAutomationStudioLlmTestRunCostCeilingUsd`
// decides) and a Flow's own limit that is not the product's old $0.25 default.
//
// Why $0.25 is not explicit: new Flows are written with
// `maxEstimatedCostUsdPerRun: 0.25` as a default (`flows/authoring/model/flows.ts`),
// so the stored value cannot tell a person's choice of $0.25 from the default.
// Treating the default as a limit would hold every attempt to a quarter of a
// dollar. Cost of that rule: a person who deliberately sets exactly $0.25 gets
// $5. A higher explicit value does not raise the $5 default.

import { AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_DEFAULT_USD, resolveAutomationStudioLlmTestRunCostCeilingUsd } from "../../../flows/authoring/model/index.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_DEFAULT_BUDGET_USD } from "./default-budget.ts";

export function automationStudioAnswerFirstBudgetUsd(input: { flowSetting?: number | undefined; env?: Readonly<Record<string, string | undefined>> | undefined } = {}): number {
  const limits: number[] = [AUTOMATION_STUDIO_ANSWER_FIRST_DEFAULT_BUDGET_USD];
  const lab = resolveAutomationStudioLlmTestRunCostCeilingUsd(input.env);
  if (lab !== undefined) limits.push(lab);
  const setting = input.flowSetting;
  if (typeof setting === "number" && Number.isFinite(setting) && setting >= 0 && setting !== AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_DEFAULT_USD) limits.push(setting);
  return Math.min(...limits);
}
