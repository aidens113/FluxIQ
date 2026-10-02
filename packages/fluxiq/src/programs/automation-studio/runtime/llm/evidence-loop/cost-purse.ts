// The loop's purse: the cost ceiling each decision's worst case is held against
// before the decision is sent (`../build-purse/purse.ts` says why the running
// average this loop counts decisions by was not enough).
//
// **The purse is the only cost authority (t234).** A build hands the loop its
// own purse (`../loop-configuration.ts`, `purse`): one per Flow creation, with
// what earlier builds of it spent carried in, against which the instruction
// reading, the test and the judge are held as well. The loop makes no purse of
// its own then, and its count of decisions left (`../loop-budget.ts`) reads
// this one's figures. Without one, a loop given a cost budget makes its own at
// that ceiling, its spending the loop's own accounting so a decision the loop
// has counted is never charged twice; any other loop runs its decisions as they
// are. A decision the purse refuses is the only way a loop ends on cost.
//
// A call that reports costing more than it was held at is a breach. Whichever
// purse is in use, every breach on it while this loop runs is counted in this
// loop's `budgetBreaches`: the delta of the purse's own count since the loop
// began, read after each decision.

import {
  AutomationStudioLlmBuildPurse,
  AutomationStudioLlmBuildPurseRefused,
  automationStudioLlmBuildPurseRun,
  type AutomationStudioLlmBuildPurseRefusal
} from "../build-purse/index.ts";
import type { AutomationStudioLlmEvidenceLoopBudget } from "../loop-budget.ts";
import type { AutomationStudioLlmEvidenceLoopAccounting } from "./accounting.ts";

export type AutomationStudioLlmEvidenceLoopPurse = {
  /** The call the purse last refused, if any; cleared before each decision. Undefined without a purse. */
  readonly refusal: AutomationStudioLlmBuildPurseRefusal | undefined;
  /** The worst case of the last call priced: the least the next, larger one can cost at worst. */
  readonly lastProjectedCostUsd: number | undefined;
  /** The purse's figures now, for the loop's count of decisions left; undefined without a purse. */
  figures(): { ceilingUsd: number; spentUsd: number; pendingUsd: number } | undefined;
  /** Ask for a decision under the purse; throws `AutomationStudioLlmBuildPurseRefused` when it was not sent. */
  run<T>(call: () => Promise<T>): Promise<T>;
  /** The refusal a throw carries, when the throw is the purse's refusal. */
  refused(thrown: unknown): AutomationStudioLlmBuildPurseRefusal | undefined;
};

/** The purse a loop's decisions are held against: the build's, when given; else one at its cost budget; else one that holds nothing. */
export function automationStudioLlmEvidenceLoopPurse(budget: AutomationStudioLlmEvidenceLoopBudget | undefined, accounting: AutomationStudioLlmEvidenceLoopAccounting, given?: AutomationStudioLlmBuildPurse): AutomationStudioLlmEvidenceLoopPurse {
  const purse = given ?? (budget?.maxCostUsd === undefined ? undefined : new AutomationStudioLlmBuildPurse({
    ceilingUsd: budget.maxCostUsd,
    spentUsd: () => accounting.estimatedCostUsd
  }));
  const breachesAtStart = purse?.breaches ?? 0;
  // Breaches on the purse since the loop began; absent while there are none.
  const countBreaches = (): void => {
    const breaches = (purse?.breaches ?? 0) - breachesAtStart;
    if (breaches > 0) accounting.budgetBreaches = breaches;
  };
  return {
    get refusal() { return purse?.refusal; },
    get lastProjectedCostUsd() { return purse?.lastProjectedCostUsd; },
    figures: () => purse ? { ceilingUsd: purse.ceilingUsd, spentUsd: purse.spentUsd(), pendingUsd: purse.pendingUsd() } : undefined,
    run: async (call) => {
      try {
        return await automationStudioLlmBuildPurseRun(purse, call);
      } finally {
        countBreaches();
      }
    },
    refused: (thrown) => thrown instanceof AutomationStudioLlmBuildPurseRefused ? thrown.refusal : undefined
  };
}
