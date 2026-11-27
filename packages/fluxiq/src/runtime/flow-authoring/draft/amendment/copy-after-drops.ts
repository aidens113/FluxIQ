// Whether a step a decision keeps, or makes the result, copies a step in the Flow, judged on the Flow as that
// decision leaves it (t1085).
//
// **The failure this closes.** Live run `run-mwz29d50-c3a32a9c` (0058): the model sent "keep 18, result 18, drop 13"
// about two reads of one cart, 13 the saved Flow's read that read nothing that attempt and 18 the read that worked. Both
// the `keep` and the `result` were refused `second_copy` of 13 (`../second-copy.ts`), because the check looked at the
// steps as they stood, before the same decision's drop of 13. A decision is one ruling: a copy of a step it takes out is
// no copy once it stands.
//
// **The rule.** The copy is looked for among the steps as they will stand after the decision's drops (`dropping`, each a
// step a `drop` of the decision names, never the step being judged). Where the only copy is one of those dropped steps,
// that copy is returned as `leansOn`: the keep stands on the drop, and the caller refuses it at the decision's end if the
// drop did not stand (a guard put it back), so the decision stays atomic per step (t1069).
import { automationStudioFlowDraftSecondCopy } from "../second-copy.ts";
import type { AutomationStudioFlowDraftStep } from "../step.ts";

type Step = AutomationStudioFlowDraftStep;

/** The step `step` would copy once the decision's drops stand, and the dropped step it would copy without them. */
export function automationStudioFlowDraftCopyAfterDrops(steps: readonly Step[], step: Step, dropping: ReadonlySet<Step>): { copy?: Step; leansOn?: Step } {
  const after = dropping.size === 0 ? steps : steps.map((each) => (each !== step && dropping.has(each) && each.disposition === "kept" ? { ...each, disposition: "dropped" as const } : each));
  const copy = automationStudioFlowDraftSecondCopy(after, step);
  if (copy) return { copy };
  if (after === steps) return {};
  const asFound = automationStudioFlowDraftSecondCopy(steps, step);
  return asFound && dropping.has(asFound) ? { leansOn: asFound } : {};
}
