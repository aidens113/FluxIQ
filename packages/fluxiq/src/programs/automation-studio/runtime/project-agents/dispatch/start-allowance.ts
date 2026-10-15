import { AUTOMATION_STUDIO_SUBFLOW_BRIEF_MIN_CALLS } from "../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioLlmBuildPurse, AutomationStudioLlmBuildPurseAllowanceRefusal } from "../../llm/build-purse/index.ts";
import type { AutomationStudioProjectSubflowBrief } from "../contracts/index.ts";
import type { AutomationStudioProjectDispatchSizedAtStart } from "./allowance-said.ts";

// A brief that waits on a predecessor of its dispatch is sized when it starts,
// from what the build's purse can then give (t627).
//
// The supervisor's dispatch sizes every brief at once (`../supervisor/brief-sizing.ts`),
// but a brief sequenced after another is carved only when its turn comes
// (`./dispatcher.ts`). Its predecessor may have been topped up from the purse
// in the meantime (`llm/build-purse/top-up.ts`): an allowance is a share of the
// Flow's purse, not a wall. Carving the dispatch-time figure then could leave
// the dependent `llm_budget.allowance_unavailable` although the purse still
// had money for it: the starvation t627's top-up would otherwise open.
//
// So when it starts it is given what the dispatch sized it at, or, where the
// purse can no longer give that, an even share of what the purse can give now:
// split over this brief, the briefs of its dispatch not yet carved, and one
// share for the build's own finishing, as the dispatch-time sizing splits it.
// Its calls are split the same way, and its turns never exceed its calls. It is
// never given more than the dispatch sized it at: the supervisor saw that
// figure and may have lowered it, and a brief that needs more is topped up as
// any is. A reset's calls are the finishing calls kept back for it and stay as
// sized. When even the share is too small to finish on -- no money, or fewer
// calls than a builder's wrap-up needs -- the brief does not start, with the
// figures the carve refusal has always given.

/** The money no brief is given less than, as the dispatch-time sizing holds it. */
const MIN_USD = 1e-6;
/** A reset brief's least calls: one decision that undoes, and one that completes. */
const MIN_RESET_CALLS = 2;

/** What a brief starts with: its money, its calls and its turns, or why it cannot start. */
export type AutomationStudioProjectDispatchStartAllowance =
  | { ok: true; allowanceUsd: number; maxCalls: number | undefined; maxIterations: number; changed: AutomationStudioProjectDispatchSizedAtStart | undefined }
  | { ok: false; refusal: AutomationStudioLlmBuildPurseAllowanceRefusal };

/**
 * Size `brief`, sized at dispatch at its `allowanceUsd` and `maxCalls`, as it
 * starts: `shares` counts it, the briefs of its dispatch not yet carved, and
 * the build's finishing (header). Without `shares` -- a brief that did not
 * wait -- it starts as the dispatch sized it. `changed` says what it was given
 * where that differs, for its return.
 */
export function automationStudioProjectDispatchStartAllowance(input: {
  brief: AutomationStudioProjectSubflowBrief;
  maxCalls: number | undefined;
  purse: AutomationStudioLlmBuildPurse;
  shares: number | undefined;
}): AutomationStudioProjectDispatchStartAllowance {
  const { brief, purse } = input;
  if (input.shares === undefined) return { ok: true, allowanceUsd: brief.allowanceUsd, maxCalls: input.maxCalls, maxIterations: brief.maxIterations, changed: undefined };
  const shares = Math.max(1, input.shares);
  const reset = brief.kind === "reset";
  const allocatableUsd = purse.allocatableUsd();
  const allocatableCalls = purse.allocatableCalls(reset ? { fromKeptBack: true } : {});
  const allowanceUsd = Math.min(brief.allowanceUsd, allocatableUsd / shares);
  const callShare = reset || allocatableCalls === undefined ? undefined : Math.floor(allocatableCalls / shares);
  const maxCalls = input.maxCalls === undefined || callShare === undefined ? input.maxCalls : Math.min(input.maxCalls, callShare);
  const least = reset ? MIN_RESET_CALLS : AUTOMATION_STUDIO_SUBFLOW_BRIEF_MIN_CALLS;
  if (allowanceUsd < MIN_USD || (maxCalls !== undefined && maxCalls < least)) {
    return {
      ok: false,
      refusal: {
        code: "llm_budget.allowance_unavailable", requestedUsd: brief.allowanceUsd, allocatableUsd, keptBackUsd: purse.keptBackUsd(),
        outstandingUsd: Math.max(0, purse.ceilingUsd - purse.spentUsd() - purse.pendingUsd() - purse.keptBackUsd() - allocatableUsd),
        ...(input.maxCalls !== undefined ? { requestedCalls: input.maxCalls } : {}),
        ...(allocatableCalls !== undefined ? { allocatableCalls } : {})
      }
    };
  }
  const changed = allowanceUsd !== brief.allowanceUsd || maxCalls !== input.maxCalls
    ? { allowanceUsd, dispatchedUsd: brief.allowanceUsd, ...(maxCalls !== undefined ? { maxCalls } : {}), ...(input.maxCalls !== undefined ? { dispatchedCalls: input.maxCalls } : {}) }
    : undefined;
  return { ok: true, allowanceUsd, maxCalls, maxIterations: maxCalls === undefined ? brief.maxIterations : Math.min(brief.maxIterations, maxCalls), changed };
}
