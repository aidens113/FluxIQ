// What a model is told when the answer it must give is a diagnosis.
//
// These are prompts, not adapter mechanics, and they were in the DeepSeek
// adapter because that is where the system message is assembled. The adapter is
// at its own line budget, so a new task kind that needs a sentence of its own
// could not be added there without pushing an unrelated file past a limit --
// which is the wrong reason to make a design decision. They live here instead,
// and the adapter asks for the instruction its request's task kind calls for.

import { automationStudioLlmTaskExpectsDiagnosis, type AutomationStudioLlmTaskKind } from "./harness.ts";

const AUTOMATION_STUDIO_DIAGNOSIS_FIELDS_INSTRUCTION = "Put your reading of the failure in the diagnosis object, not only in the summary: expected, observed and changed in at most 500 characters each, stillAchievable and deterministicRecoveryPossible as one of yes, no or unknown, and explorationNeeded and patchNeeded as booleans. Answer stillAchievable no, and patchNeeded false, where the step's intended result can no longer be had: what it acted on is gone with nothing that does the same thing, it is refused on purpose, or only a person can settle it. That answer ends the recovery without changing anything, and it is correct as often as a repair is. Omit a field you cannot answer rather than guessing it. The summary is prose nothing acts on; these fields are what the recovery is decided from.";

// Asked only of a result verification, because it is the only call whose whole
// job is that one field. A run that finished without a failed step says nothing
// about whether what it produced is what was wanted, and until this call existed
// nothing in FluxIQ ever asked: four live runs on 2026-09-17 returned none of
// eight records, none of five, ten of forty, and all two hundred and forty when
// two were asked for, and every one of them reported success.
export const AUTOMATION_STUDIO_RESULT_VERIFICATION_INSTRUCTION = "This call judges a finished run's result, not a failure. Read the instructions as the request, resultSummary as what came back, and resultSummary.flowShape as every step the Flow can perform. Answer diagnosis.answersRequest yes only when what came back is what the request asked for; answer no when it is not -- too few records, the wrong records, a count that cannot match the request, or a Flow with no step that could have narrowed or filtered what the request asked to narrow; answer unknown when the summary does not let you tell. Put what you compared in observed and what the request asked for in expected. Do not answer yes because no step failed: every run you are shown finished without a failed step, and that is exactly why you are being asked.";

/** The instruction a diagnosis-shaped task is given: the fields, plus what this particular call is for. */
export function automationStudioDiagnosisPromptInstruction(taskKind: AutomationStudioLlmTaskKind): string {
  if (!automationStudioLlmTaskExpectsDiagnosis(taskKind)) return AUTOMATION_STUDIO_DIAGNOSIS_FIELDS_INSTRUCTION;
  return taskKind === "loop_verification"
    ? `${AUTOMATION_STUDIO_DIAGNOSIS_FIELDS_INSTRUCTION} ${AUTOMATION_STUDIO_RESULT_VERIFICATION_INSTRUCTION}`
    : AUTOMATION_STUDIO_DIAGNOSIS_FIELDS_INSTRUCTION;
}
