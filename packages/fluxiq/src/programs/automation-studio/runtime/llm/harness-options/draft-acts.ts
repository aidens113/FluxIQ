// What a Flow Bootstrap's loop shows beside the draft about the instruction's
// acts, and what it names as still owed when the build stops making progress.
//
// The acts were read only inside the completion check, so the model met them
// first in a refusal (audit A1, cause 1; `./bootstrap-completion.ts` runs that
// check). This hands the loop the same reading as its `draft.acts` and
// `draft.actsMissing` (`../loop-configuration.ts`), computed from the draft each
// time it is shown (`../../flow-bootstrap/instructed-acts/checklist.ts`).
import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import {
  automationStudioInstructedActsChecklist,
  automationStudioInstructedActsChecklistValue,
  automationStudioInstructedActsNotDone
} from "../../flow-bootstrap/index.ts";

/** The loop's two act callbacks for one build's instruction and start location. */
export function automationStudioFlowBootstrapDraftActs(input: { instructionText?: string | undefined; startLocation?: string | undefined }): {
  acts(steps: readonly AutomationStudioFlowDraftStep[]): JsonValue | undefined;
  actsMissing(steps: readonly AutomationStudioFlowDraftStep[]): readonly string[];
} {
  const checklist = (steps: readonly AutomationStudioFlowDraftStep[]) =>
    automationStudioInstructedActsChecklist({ instructionText: input.instructionText, draftSteps: steps, startLocation: input.startLocation });
  return {
    acts: (steps) => automationStudioInstructedActsChecklistValue(checklist(steps)),
    actsMissing: (steps) => automationStudioInstructedActsNotDone(checklist(steps))
  };
}
