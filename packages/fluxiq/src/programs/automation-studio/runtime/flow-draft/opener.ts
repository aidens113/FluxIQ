// A step in the Flow keeps the steps that got its page there.
//
// **The failure this first closed (lane A, t174 run 40, bigbox pickup cart).**
// The model pressed the store chip, which opened the store chooser, without
// adding that press to the Flow, then added "Set as my store" from inside the
// chooser. The proposed Flow ran "Set as my store" on a page where the chooser
// was closed, and playback failed there on a button with a zero-size box. The
// press that opened the chooser was in the draft all along, as a step taken
// and not kept.
//
// **The failure that took the count away (t174 F41, run muqk4u32).** The rule
// then brought at most two presses back. The model added a variant on an item
// page reached by a ×, a search, a listing that opened a new tab, a consent
// and a colour, all taken: the colour and the consent were kept, the rest were
// not, and two dry runs ran the item-page steps on the home page.
//
// **The rule.** When a step joins the Flow, every step the model took without
// deciding about it (`taken`) that changed the page since the last step in the
// Flow joins too, detours left out (`./path-to-step.ts` says exactly which).
// The step ran on what they left, so a Flow without them runs it somewhere
// else. Nothing is brought past a step in the Flow, past a step the model
// withdrew, or for a step whose page is back where the way started.

import { automationStudioFlowDraftPathToStep } from "./path-to-step.ts";
import type { AutomationStudioFlowDraftStep } from "./step.ts";

/** Keeps the steps that got `step`'s page there, and returns them newest first. */
export function automationStudioFlowDraftKeepOpeners(steps: readonly AutomationStudioFlowDraftStep[], step: AutomationStudioFlowDraftStep): AutomationStudioFlowDraftStep[] {
  const way = automationStudioFlowDraftPathToStep(steps, step);
  for (const opener of way) opener.disposition = "kept";
  return way.reverse();
}
