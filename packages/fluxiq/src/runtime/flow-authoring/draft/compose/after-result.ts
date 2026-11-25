// Leaves out the presses after the result's last read that lead nowhere the result goes.
//
// **Why.** The offline replay of recorded run `run-mwuuo3zk-75b482b3` (t1037) read the list, then pressed a
// filter and the next page, and every read after those failed. The drafted Flow read the rows and then
// pressed the filter and the next page for nothing: what those presses changed reaches no read of the
// result and no lasting act. So where the Flow has a result read, a framework step that changes something
// after the last of them, with nothing lasting after it (`./lasting.ts`), is a `dead_end`. A Flow with no
// result read is left alone: there, the last press may be the very thing asked for. The model can put a
// step back with `keep`, and a step it kept is lasting, so nothing before it is touched.
import { automationStudioFlowDraftStepIsLasting } from "./lasting.ts";
import { automationStudioFlowDraftMark } from "./mark.ts";
import type { AutomationStudioFlowDraftStep } from "../step.ts";

/** Marks `dead_end` on the framework's presses after the result's last read in `ordered` (run order) that nothing lasting follows. */
export function automationStudioFlowDraftMarkAfterResult(
  ordered: readonly AutomationStudioFlowDraftStep[],
  framework: ReadonlySet<AutomationStudioFlowDraftStep>,
  resultReads: ReadonlySet<AutomationStudioFlowDraftStep>
): void {
  if (resultReads.size === 0) return;
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const step = ordered[index]!;
    if (automationStudioFlowDraftStepIsLasting(step, framework, resultReads)) return;
    if (framework.has(step) && step.disposition === "kept" && step.effect === "mutate") automationStudioFlowDraftMark(step, "dead_end");
  }
}
