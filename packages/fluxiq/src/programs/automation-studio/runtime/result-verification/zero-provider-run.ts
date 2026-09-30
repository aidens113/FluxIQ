// What a finished run that asked no model anything says about its cost.
//
// Only the recovery wrote `metadata.llmGate`, so a run that never failed kept no
// accounting at all, and "this run made no provider call" could not be told
// from "nobody counted" (lane t179). A deterministic replay is exactly the run
// that has to prove the first, so it could never be certified. A run with no
// gate and no intervention -- no recovery, no judgement, no diagnosis -- asked
// nothing, and now says so with a zero accounting in the gate's own shape,
// written in the same save as its verdict (`run-outcome.ts`). The same run is
// the replay the confidence rule counts, which is why `run-outcome.ts` hands it
// to the replay recorder when this answers a gate.
//
// A run that did ask keeps whatever its recovery or its judgement recorded;
// nothing here writes over it.

import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioFlowRunDetail } from "../../model/index.ts";

/** The recovery gate's accounting shape, spent on nothing (`llm/run-budget.ts` `snapshot`). */
const ZERO_ACCOUNTING = Object.freeze({ calls: 0, explorationCalls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0, budgetBreaches: 0, pendingCalls: 0 });

/**
 * The gate a run carries when nothing on it reached for a model -- no gate
 * already, no intervention on the run, none from this verification -- or
 * `undefined` when something did. `invoked: false` with no `code`: nothing was
 * declined, because nothing was asked. The call list is present and empty with
 * nothing omitted, so a reader that certifies a count only against an itemized
 * list can certify this one.
 */
export function automationStudioZeroProviderGate(detail: AutomationStudioFlowRunDetail, verificationInterventions: readonly unknown[]): JsonObject | undefined {
  if (detail.metadata?.llmGate !== undefined || detail.interventions.length > 0 || verificationInterventions.length > 0) return undefined;
  return { invoked: false, ok: true, costAccounting: { ...ZERO_ACCOUNTING }, providerCalls: [], providerCallsOmitted: 0 };
}
