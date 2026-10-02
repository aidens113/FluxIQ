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
// (`taken`): the newest step before it that changed the page, whose page after
// is exactly the one this step found (`stateAfter` = `stateBefore`), and which
// the Flow could hold. That step's own opener is kept the same way, so a menu
// inside a drawer brings both presses. Nothing is kept without both states, a
// step the model dropped is never brought back, and a page that moved between
// the two (its digests differ) keeps nothing: the chain is only followed where
// the draft itself shows one step made the other's page.

import { automationStudioFlowDraftStepIsProposable, type AutomationStudioFlowDraftStep } from "./step.ts";

/** Keeps the steps that opened `step`'s page, newest first, and returns them. */
export function automationStudioFlowDraftKeepOpeners(steps: readonly AutomationStudioFlowDraftStep[], step: AutomationStudioFlowDraftStep): AutomationStudioFlowDraftStep[] {
  const kept: AutomationStudioFlowDraftStep[] = [];
  for (let current: AutomationStudioFlowDraftStep | undefined = step; current;) {
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
  if (!changed || changed.stateAfter !== step.stateBefore || changed.disposition !== "taken" || !automationStudioFlowDraftStepIsProposable(changed)) return undefined;
  return changed;
}
