// Marks the stretches of a run that went out and came back with nothing lasting done.
//
// **Why.** An explorer opens a page, presses around, and goes back: every step on that detour left the
// state it started from and returned to it (D16). Whole-state digests say so without knowing the domain:
// a framework step that changes state S, and a later step after which the state is S again, bracket a
// detour. It is a dead end unless something lasting happened inside -- a step the model put in the Flow,
// one that changed the page, claimed an act, flipped a control, was only written, or is a result read --
// in which case the way back is not the point and nothing is marked. Steps with no digests never form a
// dead end. The last return wins, so a detour that wandered and came back twice is one dead end, and the
// walk continues after it.
import { automationStudioFlowDraftStepIsLasting } from "./lasting.ts";
import { automationStudioFlowDraftMark } from "./mark.ts";
import type { AutomationStudioFlowDraftStep } from "../step.ts";

/** Marks `dead_end` on the framework steps of each detour in `ordered` (run order); `framework` names the framework's steps, `resultReads` the result's. */
export function automationStudioFlowDraftMarkDeadEnds(
  ordered: readonly AutomationStudioFlowDraftStep[],
  framework: ReadonlySet<AutomationStudioFlowDraftStep>,
  resultReads: ReadonlySet<AutomationStudioFlowDraftStep>
): void {
  let index = 0;
  while (index < ordered.length) {
    const step = ordered[index]!;
    const returned = framework.has(step) && step.disposition === "kept" && step.effect === "mutate" && step.stateBefore !== undefined
      ? lastReturn(ordered, index, step.stateBefore)
      : -1;
    if (returned < 0 || ordered.slice(index, returned + 1).some((inside) => automationStudioFlowDraftStepIsLasting(inside, framework, resultReads))) {
      index += 1;
      continue;
    }
    for (const inside of ordered.slice(index, returned + 1)) {
      if (framework.has(inside) && inside.disposition === "kept") automationStudioFlowDraftMark(inside, "dead_end");
    }
    index = returned + 1;
  }
}

/** The position in `ordered`, after `from`, of the last step whose state after is `state`; -1 when none. */
function lastReturn(ordered: readonly AutomationStudioFlowDraftStep[], from: number, state: string): number {
  for (let index = ordered.length - 1; index > from; index -= 1) {
    if (ordered[index]!.stateAfter === state) return index;
  }
  return -1;
}
