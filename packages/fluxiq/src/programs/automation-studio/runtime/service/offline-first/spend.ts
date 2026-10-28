import type { AutomationStudioOfflineFirstRecord, AutomationStudioOfflineFirstSpent } from "./contracts.ts";

/** What the judge was paid for a factory's offline runs (an offline pass pays it again live, D42), summed from their records. */
export function automationStudioOfflineFirstSpend(records: readonly AutomationStudioOfflineFirstRecord<{ judge: AutomationStudioOfflineFirstSpent }>[]): AutomationStudioOfflineFirstSpent {
  return records.reduce((total, { record: { judge } }) => ({
    calls: total.calls + judge.calls,
    inputTokens: total.inputTokens + judge.inputTokens,
    outputTokens: total.outputTokens + judge.outputTokens,
    totalTokens: total.totalTokens + judge.totalTokens,
    estimatedCostUsd: total.estimatedCostUsd + judge.estimatedCostUsd
  }), { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 });
}
