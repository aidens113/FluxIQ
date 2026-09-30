// What a caller's check made of a completed result, and the entry a refusal's
// feedback reaches the model under.
//
// The two belong in one file because the refusal is only half a mechanism
// without the entry: the check says the result is wrong, and the entry is how
// the model is told before it is asked again.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceLoopAnswerability } from "./answerability.ts";

/**
 * What a caller's check made of a completed result. A refusal names why, in
 * issue codes, and carries the feedback the model is shown before it is asked
 * again: bounded JSON the caller authored -- what was wrong and where -- never
 * content the model has not already seen from its own tools.
 */
export type AutomationStudioLlmEvidenceCompletionCheck =
  | { ok: true; answerability?: AutomationStudioLlmEvidenceLoopAnswerability; restoredStep?: AutomationStudioLlmEvidenceRestoredStep }
  | { ok: false; issueCodes: readonly string[]; feedback: JsonObject; answerability?: AutomationStudioLlmEvidenceLoopAnswerability; restoredStep?: AutomationStudioLlmEvidenceRestoredStep };

/**
 * A withdrawn draft step the check put back before checking: which one, by the
 * draft position it had, and how the model had withdrawn it. Content-free --
 * a position and a closed word -- so it may travel on every published record.
 *
 * Flow Bootstrap restores the step that reached the start location when the
 * draft's amendments had withdrawn it (`../../flow-bootstrap/reachability/start-step.ts`),
 * and that silently changed the Flow a completion was judged on: nothing in a
 * run's record said the Flow had a step the model had taken out.
 */
export type AutomationStudioLlmEvidenceRestoredStep = { step: number; withdrawnAs: "dropped" | "exploratory" | "taken" };

/** The evidence entry a refused completion's feedback arrives under. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID = "core.completion_check";

