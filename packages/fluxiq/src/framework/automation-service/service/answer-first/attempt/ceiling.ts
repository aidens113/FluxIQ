// The dollars one attempt's purse opens at: `automationStudioAnswerFirstBudgetUsd`, and no more
// than the host's resolver allows a run in total, which is as explicit as a Flow's own limit.

import { automationStudioAnswerFirstBudgetUsd } from "../../../../../runtime/answer-first/attempt-purse/index.ts";

export function automationStudioAnswerFirstCeilingUsd(input: { flowSetting?: number | undefined; resolverTotalUsd?: number | undefined }): number {
  const budget = automationStudioAnswerFirstBudgetUsd({ flowSetting: input.flowSetting });
  const total = input.resolverTotalUsd;
  return typeof total === "number" && Number.isFinite(total) && total > 0 ? Math.min(budget, total) : budget;
}
