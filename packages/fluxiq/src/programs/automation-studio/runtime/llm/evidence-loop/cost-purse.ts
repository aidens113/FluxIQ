// The loop's purse: its cost budget held against each decision's worst case
// before the decision is sent (`../build-purse/purse.ts` says why the running
// average this loop counts decisions by was not enough).
//
// Only a loop given a cost budget holds anything -- a build, and each repair
// round of one, whose budget is what the rounds before left; any other loop
// gets a purse that runs its decisions as they are. Its spending is the loop's
// own accounting, so a decision the loop has counted is never charged twice,
// and a call that reports costing more than it was held at is a breach on that
// same accounting.

import {
  AutomationStudioLlmBuildPurse,
  AutomationStudioLlmBuildPurseRefused,
  automationStudioLlmBuildPurseRun,
  type AutomationStudioLlmBuildPurseRefusal
} from "../build-purse/index.ts";
import type { AutomationStudioLlmEvidenceLoopBudget } from "../loop-budget.ts";
import type { AutomationStudioLlmEvidenceLoopAccounting } from "./accounting.ts";

export type AutomationStudioLlmEvidenceLoopPurse = {
  /** The decision the purse refused, once it has: what ended the loop. */
  readonly refusal: AutomationStudioLlmBuildPurseRefusal | undefined;
  /** The worst case of the last decision priced: the least the next, larger one can cost at worst. */
  readonly lastProjectedCostUsd: number | undefined;
  /** Ask for a decision under the purse; throws `AutomationStudioLlmBuildPurseRefused` when it was not sent. */
  run<T>(call: () => Promise<T>): Promise<T>;
  /** Whether a throw is the purse's refusal. */
  refused(thrown: unknown): boolean;
};

/** The purse for a loop's cost budget; one that holds nothing when it has none. */
export function automationStudioLlmEvidenceLoopPurse(budget: AutomationStudioLlmEvidenceLoopBudget | undefined, accounting: AutomationStudioLlmEvidenceLoopAccounting): AutomationStudioLlmEvidenceLoopPurse {
  const purse = budget?.maxCostUsd === undefined ? undefined : new AutomationStudioLlmBuildPurse({
    ceilingUsd: budget.maxCostUsd,
    spentUsd: () => accounting.estimatedCostUsd,
    onBreach: () => { accounting.budgetBreaches = (accounting.budgetBreaches ?? 0) + 1; }
  });
  return {
    get refusal() { return purse?.refusal; },
    get lastProjectedCostUsd() { return purse?.lastProjectedCostUsd; },
    run: (call) => automationStudioLlmBuildPurseRun(purse, call),
    refused: (thrown) => thrown instanceof AutomationStudioLlmBuildPurseRefused
  };
}
