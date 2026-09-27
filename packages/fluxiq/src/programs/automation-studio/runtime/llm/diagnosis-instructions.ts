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
//
// The empty-result sentences are load-bearing rather than decorative. Until
// 2026-09-24 a run that stored nothing was never put to this call at all, and
// the reason given was that an empty table is sometimes the right answer -- so
// the first thing this call must be able to do with one is say yes. It is told
// how to tell a Flow that searched and found nothing from one that never looked,
// and told that a run with no record set at all is judged on what it did.
//
// The closing sentences are the 2026-09-26 instruction that this call must issue
// fix instructions rather than a verdict, and they are written to be safe to
// ignore. The repair is handed `failure.expected` and `failure.actual` and
// nothing else (`recovery/context.ts`), so what is written in `observed` and
// `changed` is literally all the repair gets -- which is why the ask says so.
// And the last sentence is load-bearing in the other direction: a terse
// judgement still produces a valid refutation, asserted in `verdict.test.ts`, so
// a model that offers no advice costs the run nothing. Nothing new is demanded
// of the model: these are fields the diagnosis reply already carries.
export const AUTOMATION_STUDIO_RESULT_VERIFICATION_INSTRUCTION = "This call judges a finished run's result, not a failure. Read the instructions as the request, resultSummary as what came back, and resultSummary.flowShape as every step the Flow can perform. Answer diagnosis.answersRequest yes only when what came back is what the request asked for; answer no when it is not -- too few records, the wrong records, a count that cannot match the request, or a Flow with no step that could have narrowed or filtered what the request asked to narrow; answer unknown when the summary does not let you tell. An empty result is judged the same way and is not wrong by itself: answer yes when the request's own terms make nothing the right answer and the Flow's steps show it actually looked -- a request to list whatever matches, where the Flow searched, filtered and stored no row, is answered by an empty table. Answer no when the request expected rows and the steps show the Flow never looked, looked somewhere the request did not ask for, or had no step that could store what it found. A run that stored no record set at all is judged on what it did rather than on what it returned: answer yes when the request was to carry something out and flowShape and the steps that ran show it was carried out, no when they show it was not. Put what you compared in observed and what the request asked for in expected. Do not answer yes because no step failed: every run you are shown finished without a failed step, and that is exactly why you are being asked. When you answer no, say in observed which rows or columns are wrong, and in changed what to change to fix it: name the clause of the request the result does not satisfy, and the step whose parameters would have to change, by its nodeId in resultSummary.flowShape. A bare verdict is not the job -- the repair that follows is given what you write here and nothing else. If you have no suggestion, answer no without one rather than inventing one: a refusal with no advice is still a valid refusal and nothing fails for it.";

/** The instruction a diagnosis-shaped task is given: the fields, plus what this particular call is for. */
export function automationStudioDiagnosisPromptInstruction(taskKind: AutomationStudioLlmTaskKind): string {
  if (!automationStudioLlmTaskExpectsDiagnosis(taskKind)) return AUTOMATION_STUDIO_DIAGNOSIS_FIELDS_INSTRUCTION;
  return taskKind === "loop_verification"
    ? `${AUTOMATION_STUDIO_DIAGNOSIS_FIELDS_INSTRUCTION} ${AUTOMATION_STUDIO_RESULT_VERIFICATION_INSTRUCTION}`
    : AUTOMATION_STUDIO_DIAGNOSIS_FIELDS_INSTRUCTION;
}
