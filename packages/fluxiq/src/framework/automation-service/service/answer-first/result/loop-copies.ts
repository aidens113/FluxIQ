// The draft steps a saved Flow leaves out because they do a paging loop's own work again by hand (lead addition C,
// run-mwcncux8).
//
// That exploration authored the loop (read the list, press Next page, repeat while Next page answers), then pressed Next
// page and read the same list by hand, and added both. Saved after the loop, they ran once the loop had already read
// every page: the stray Next page found nothing to press and the Flow stopped on `executor.graph.unmatched_route`.
//
// A hand-made read of the list a loop's read step already reads the same way (`listKey`, conditions and fields: lead
// decision D2) is that step: the ledger folds it in (`./step-set.ts`), and its page is the step's. So it is no step of
// the Flow, and neither is the press right before it where that press is the loop's own advancing step again (the same
// action on the same control): it only moved the list on for the copy. Anything else stays, a press that does another
// act among them. Only a read step with a `repeat ... while` (a paging loop) is read this way.
import { stableJson } from "../../stable-json.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../../runtime/flow-authoring/draft/index.ts";
import type { AutomationStudioAnswerFirstResultLedger } from "./types.ts";

/** The kept draft steps to leave out of the saved Flow; `idOf` is the ledger id the wiring gives a draft step. */
export function automationStudioAnswerFirstResultLoopCopies(
  steps: readonly AutomationStudioFlowDraftStep[],
  ledger: AutomationStudioAnswerFirstResultLedger,
  idOf: (step: AutomationStudioFlowDraftStep) => string,
): Set<AutomationStudioFlowDraftStep> {
  const kept = steps.filter((step) => step.disposition === "kept").sort((one, other) => one.position - other.position);
  const copies = new Set<AutomationStudioFlowDraftStep>();
  for (const holder of ledger.steps) {
    if (!holder.folded.length) continue;
    const loopRead = kept.find((step) => idOf(step) === holder.id);
    const routing = loopRead?.routing;
    if (!loopRead || routing?.kind !== "repeat" || routing.while === undefined) continue;
    const advance = steps.find((step) => step.id === routing.while);
    for (const folded of holder.folded) {
      const copy: AutomationStudioFlowDraftStep | undefined = kept.find((step) => step !== loopRead && idOf(step) === folded.id);
      if (!copy || copy.routing) continue;
      copies.add(copy);
      const before: AutomationStudioFlowDraftStep | undefined = kept[kept.indexOf(copy) - 1];
      if (before && advance && before !== advance && before !== loopRead && !before.routing && sameAct(before, advance)) copies.add(before);
    }
  }
  return copies;
}

/** The same action on the same control: what it ran with, or the control's own words where a handle was minted again. */
function sameAct(one: AutomationStudioFlowDraftStep, other: AutomationStudioFlowDraftStep): boolean {
  if (one.actionId !== other.actionId || one.toolId !== other.toolId || one.effect !== other.effect) return false;
  if (stableJson(one.ranWith ?? one.input) === stableJson(other.ranWith ?? other.input)) return true;
  return one.control !== undefined && one.control === other.control;
}
