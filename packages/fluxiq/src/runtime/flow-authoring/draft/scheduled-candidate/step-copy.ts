// A draft step copied so its holder cannot change it, keeping a scheduled
// candidate it still stands on.
//
// **Every hand-over of a draft copies through this one function (t690).** A
// deep copy lends a step no scheduled candidate (`./candidate.ts`), and every
// round stall used to deep-copy the loop's steps itself: the evidence loop's
// refused-completion stall and the refusal-run, refused-repeat and searching
// stalls (`../../llm/`). The round's ending and the repair seed
// (`../../flow-bootstrap/unfinished-build/`) then copied from clones that had
// already lost them, so after one stall every unchanged carried step read as
// never run in this build and the model reran each saved step one at a time
// (t688, Lab steps 0095-0120).
//
// `reshape` changes the copy before its candidate is carried, as the repair
// seed renumbers its steps: the candidate is carried only where the reshaped
// copy is still the configuration it was scheduled with (position aside), so
// an edited step is never run as its saved version.

import type { AutomationStudioFlowDraftStep } from "../step.ts";
import { automationStudioFlowDraftCopyScheduledCandidate } from "./candidate.ts";

/** A deep copy of `step`, reshaped by `reshape`, that keeps the scheduled candidate the original still stands on. */
export function automationStudioFlowDraftStepCopy(step: AutomationStudioFlowDraftStep, reshape?: (copy: AutomationStudioFlowDraftStep) => void): AutomationStudioFlowDraftStep {
  const copy = structuredClone(step);
  reshape?.(copy);
  if (step.scheduledCandidate !== undefined) {
    copy.scheduledCandidate = step.scheduledCandidate;
    automationStudioFlowDraftCopyScheduledCandidate(step, copy);
  }
  return copy;
}
