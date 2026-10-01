// What the model is told when a call is refused as a repeat
// (`./outcomes.ts`): that it already made this call on this page, what came of
// it, and what to do instead. Codes and Core's own sentences; never a page
// value.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceRepeatedOutcome } from "./outcomes.ts";

/** The entry a refused repeat is shown under; a newer one replaces the older. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_CHECK_TOOL_ID = "core.repeat_check";

/** The code a refused repeat is recorded and refused under. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_REFUSED_CODE = "llm_evidence_loop.repeat_refused";

/**
 * Decisions in a row refused as repeats after which the round ends as a stall:
 * the Flow so far is then tested, judged and repaired, or the build says why it
 * cannot be done (`../../flow-bootstrap/unfinished-build/phases.ts`).
 */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_REFUSED_REPEATS_IN_A_ROW = 3;

const INSTRUCTION = "You already made this exact call -- the same tool with the same input -- on this exact page, and it did not work then or changed nothing. "
  + "Making it again on an unchanged page does the same, so it was not run and cost nothing but this decision. "
  + "Do something different instead: amend the draft (rerun a step with a corrected argument, mark it optional, or drop it), "
  + "look at or search the page for what you need, use a different control or a different input, or ask the person. "
  + "A call that runs after the page has changed is not a repeat. Repeats refused in a row end this round, and the Flow so far is then tested and judged.";

/** The note shown for one refused repeat. */
export function automationStudioLlmEvidenceRepeatRefusalNote(input: {
  toolId: string;
  earlier: AutomationStudioLlmEvidenceRepeatedOutcome;
  inARow: number;
}): JsonObject {
  return {
    ok: false,
    code: AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_REFUSED_CODE,
    toolId: input.toolId,
    sameAsCall: input.earlier.callId,
    then: {
      outcome: input.earlier.outcome,
      ...(input.earlier.resultCode ? { resultCode: input.earlier.resultCode } : {}),
      ...(input.earlier.resultReason ? { resultReason: input.earlier.resultReason } : {})
    },
    refusedInARow: input.inARow,
    maxRefusedInARow: AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_REFUSED_REPEATS_IN_A_ROW,
    instruction: INSTRUCTION
  };
}
