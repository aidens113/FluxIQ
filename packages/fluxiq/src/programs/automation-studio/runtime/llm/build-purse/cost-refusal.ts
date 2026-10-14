// Why a purse would not pay for a call, in figures (`./purse.ts`, `hold`). A
// figure that is nothing -- no carried spend, nothing kept back for judging,
// nothing held by other allowances -- is left out rather than written as zero,
// and an allowance's refusal names the brief it was carved for.

import type { AutomationStudioLlmBuildPurseAttribution } from "./allowance-book.ts";
import type { AutomationStudioLlmBuildPurseRefusal } from "./types.ts";

type AutomationStudioLlmBuildPurseCostFigures = {
  projectedCostUsd: number | undefined;
  estimatedInputTokens: number;
  maxOutputTokens: number;
  spentUsd: number;
  pendingUsd: number;
  ceilingUsd: number;
  carriedUsd: number;
  keptBackUsd: number;
  allottedUsd: number;
  attribution: AutomationStudioLlmBuildPurseAttribution | undefined;
  closed: boolean;
};

/** The cost refusal for a call held at these figures. */
export function automationStudioLlmBuildPurseCostRefusal(figures: AutomationStudioLlmBuildPurseCostFigures): AutomationStudioLlmBuildPurseRefusal {
  return {
    code: "llm_budget.run_cost_limit",
    ...(figures.projectedCostUsd !== undefined ? { projectedCostUsd: figures.projectedCostUsd } : {}),
    estimatedInputTokens: figures.estimatedInputTokens,
    maxOutputTokens: figures.maxOutputTokens,
    spentUsd: figures.spentUsd,
    pendingUsd: figures.pendingUsd,
    ceilingUsd: figures.ceilingUsd,
    ...(figures.carriedUsd > 0 ? { carriedUsd: figures.carriedUsd } : {}),
    ...(figures.keptBackUsd > 0 ? { keptBackUsd: figures.keptBackUsd } : {}),
    ...(figures.allottedUsd > 0 ? { allottedUsd: figures.allottedUsd } : {}),
    ...(figures.attribution ? { allowance: { ...figures.attribution } } : {}),
    ...(figures.closed ? { closed: true as const } : {})
  };
}
