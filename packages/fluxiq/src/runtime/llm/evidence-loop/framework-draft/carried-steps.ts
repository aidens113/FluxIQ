// The seeded steps that are the model's word: carried from a saved Flow or an earlier attempt.
//
// **Why (t1037 phase 2).** The framework drafts the Flow and recomposes it after every call (`../../flow-authoring/
// draft/compose/`). A saved draft's steps keep the framework's word on them (`drafted`), so seeded into a later
// attempt they were recomposed as if this attempt had run them: the saved read a run broke at was taken out as an
// earlier copy of the read the model then made by hand, so a Flow that still read where it broke was saved as
// repaired and counted as one. A saved step is the model's word, as the user's saved Flow is: it stays as it was
// saved until the model edits it. So each carried step is listed here, and one that is in the Flow loses the
// framework's mark, which also makes a rerun of it the model's step in its place (`../rerun/replacement.ts`).
// A step left out keeps its reason to show; the composer never decides it again (`isRuled`).
import { automationStudioFlowDraftStepCarried } from "../../../flow-authoring/draft/carried-step/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-authoring/draft/index.ts";

/** The ids of the carried steps among `seeded` (listed in `carriedIds`, or named `f<n>`); a carried step in the Flow becomes the model's. */
export function automationStudioLlmEvidenceCarriedSteps(seeded: readonly AutomationStudioFlowDraftStep[], carriedIds: readonly string[] | undefined): ReadonlySet<string> {
  const listed = new Set(carriedIds ?? []);
  const carried = new Set<string>();
  for (const step of seeded) {
    if (step.id === undefined || !(listed.has(step.id) || automationStudioFlowDraftStepCarried(step))) continue;
    carried.add(step.id);
    if (step.disposition === "kept") delete step.drafted;
  }
  return carried;
}
