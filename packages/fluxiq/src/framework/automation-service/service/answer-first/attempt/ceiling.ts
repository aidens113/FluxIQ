// The dollars one attempt's purse opens at: `automationStudioAnswerFirstBudgetUsd`, and no more
// than the host's resolver allows a run in total, which is as explicit as a Flow's own limit.
//
// **A carry-on's purse is what was left and what the person added** (`../carry-on/`), read here
// because this is the moment before the purse opens. A person's press is explicit, so the default
// and a Flow's own limit do not hold it down; the host's total and a Lab's ceiling still do.
//
// **A caller's own budget** (`callerUsd`, `AutomationStudioAnswerFirstCallerOptions.budgetUsd`)
// takes the default's place, so it may raise the purse past $5; the host's total still holds it.

import { resolveAutomationStudioLlmTestRunCostCeilingUsd } from "../../../../../flows/authoring/model/index.ts";
import { automationStudioAnswerFirstBudgetUsd } from "../../../../../runtime/answer-first/attempt-purse/index.ts";
import { automationStudioAnswerFirstCarryOnScope } from "../carry-on/index.ts";

export function automationStudioAnswerFirstCeilingUsd(input: { flowSetting?: number | undefined; resolverTotalUsd?: number | undefined; callerUsd?: number | undefined }): number {
  const hold = automationStudioAnswerFirstCarryOnScope.getStore();
  const carried = hold && !hold.opened ? Math.min(hold.askedUsd, resolveAutomationStudioLlmTestRunCostCeilingUsd() ?? hold.askedUsd) : undefined;
  const budget = carried ?? automationStudioAnswerFirstBudgetUsd({ flowSetting: input.flowSetting, callerUsd: input.callerUsd });
  const total = input.resolverTotalUsd;
  return typeof total === "number" && Number.isFinite(total) && total > 0 ? Math.min(budget, total) : budget;
}
