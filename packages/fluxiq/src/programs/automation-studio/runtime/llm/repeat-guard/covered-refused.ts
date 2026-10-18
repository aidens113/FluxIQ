// Whether a call refused as a repeat was refused, the first time, because
// something over the page covered the control it pressed.
//
// **Why.** A8 breadth run `run-mvcwem7d-34689f55` (crossborder, both briefs): a
// builder pressed a control under a covering layer, the domain refused it as
// covered (`target_covered`) and named the layer and its closers, and the model
// sent the same press three more times. Each was refused as a repeat with the
// note every failed call gets -- "use a different control or a different
// input" -- which never said the press only works once the covering layer is
// closed, and the brief ended. A covered press is refused before anything is
// pressed, whichever domain carried it: its code ends in `target_covered` or
// `blocked_by_dialog`.

import type { AutomationStudioLlmEvidenceRepeatedOutcome } from "./outcomes.ts";

const COVERED_REFUSED = /(?:^|[._])(?:target_covered|blocked_by_dialog)$/u;

/** Whether `earlier` failed because a layer over the page covered the control it pressed. */
export function automationStudioLlmEvidenceRepeatCoveredRefused(earlier: AutomationStudioLlmEvidenceRepeatedOutcome): boolean {
  return earlier.outcome === "failed" && typeof earlier.resultCode === "string" && COVERED_REFUSED.test(earlier.resultCode);
}
