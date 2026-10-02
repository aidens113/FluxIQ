// A step in the Flow keeps the press that opened its page.
//
// **The failure this closes (lane A, t174 run 40, bigbox pickup cart).** The
// model pressed the store chip, which opened the store chooser, without adding
// that press to the Flow, then added "Set as my store" from inside the chooser.
// The proposed Flow ran "Set as my store" on a page where the chooser was
// closed, and playback failed there on a button with a zero-size box. The
// press that opened the chooser was in the draft all along, as a step taken
// and not kept.
//
// **The rule.** When a step joins the Flow, the step that left the page it
// started on joins too, when the model took it without deciding about it
// (`taken`) and the Flow could hold it: the newest step before it that changed
// the page. Nothing else changed the page between them, so this step ran on
// what that one left. That holds whether or not their digests agree exactly:
// t193's run 40 pressed a product link and then a size on the product page,
// and the page went on loading between the two (`after` 129619 bytes, the
// next `before` 132179), so an exact match kept nothing. What still keeps
// nothing: a step whose page is back where that step started (its effect gone
// by itself), a step the model dropped, a step with no states, and anything
// past `MAX_OPENERS` -- a chooser inside a drawer brings both presses, and no
// longer chain of exploring is pulled into the Flow.

import { automationStudioFlowDraftStepIsProposable, type AutomationStudioFlowDraftStep } from "./step.ts";

/** How many presses back a kept step brings: the one that opened its page, and the one that opened that. */
const MAX_OPENERS = 2;

/** Keeps the steps that opened `step`'s page, newest first, and returns them. */
export function automationStudioFlowDraftKeepOpeners(steps: readonly AutomationStudioFlowDraftStep[], step: AutomationStudioFlowDraftStep): AutomationStudioFlowDraftStep[] {
  const kept: AutomationStudioFlowDraftStep[] = [];
  for (let current: AutomationStudioFlowDraftStep | undefined = step; current && kept.length < MAX_OPENERS;) {
    const opener = openerOf(steps, current);
    if (!opener) break;
    opener.disposition = "kept";
    kept.push(opener);
    current = opener;
  }
  return kept;
}

/** The taken step that made `step`'s page, when the draft shows one did. */
function openerOf(steps: readonly AutomationStudioFlowDraftStep[], step: AutomationStudioFlowDraftStep): AutomationStudioFlowDraftStep | undefined {
  if (step.stateBefore === undefined) return undefined;
  // The newest step that ran before this one and changed the page.
  const changed = steps
    .filter((candidate) => candidate !== step && candidate.iteration < step.iteration && candidate.stateBefore !== undefined && candidate.stateAfter !== undefined && candidate.stateBefore !== candidate.stateAfter)
    .reduce<AutomationStudioFlowDraftStep | undefined>((newest, candidate) => (!newest || candidate.iteration > newest.iteration ? candidate : newest), undefined);
  if (!changed || changed.disposition !== "taken" || !automationStudioFlowDraftStepIsProposable(changed)) return undefined;
  // Back where that step started: what it opened is gone, and this step does not stand on it.
  return changed.stateBefore === step.stateBefore ? undefined : changed;
}
