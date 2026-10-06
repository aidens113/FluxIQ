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

const INSTRUCTION = "You already made this exact call -- the same tool with the same input -- on this exact page, and it did not work then, changed nothing, or ended on the same page as the same call before it (then.outcome). "
  + "Making it again from this page does the same, so it was not run and cost nothing but this decision. "
  + "Do something different instead: amend the draft (rerun a step with a corrected argument, mark it optional, or drop it), "
  + "look at or search the page for what you need, use a different control or a different input, or ask the person. "
  + "A call that runs after the page has changed is not a repeat. Repeats refused in a row end this round, and the Flow so far is then tested and judged.";

/** Said instead for a look that already answered the same on this page (`same_answer`). */
const LOOK_INSTRUCTION = "You already made this exact look -- the same tool with the same input -- on this exact page, and it answered the same twice: its answer is above, under sameAsCall. "
  + "The page has not changed, so asking again answers the same again; it was not run. "
  + "Change your approach: act on what the answers show (press, type into or choose a control the page shows), go to another page, use the page's own search or menus, or look for something different. "
  + "Repeats refused in a row end this round, and the Flow so far is then tested and judged.";

/**
 * Said instead for a call that failed only because a handle it names was never
 * shown on this page (`handleUnshown`, `./outcomes.ts`): the call itself may be
 * right, and the same call runs again once a call has shown or minted the handle.
 */
const HANDLE_UNSHOWN_INSTRUCTION = "You already made this exact call -- the same tool with the same input -- on this exact page, and it failed because a handle it names was never shown here (then.resultReason): no call had shown or minted that handle yet, and none has since, so it was not run. "
  + "The call itself may be right. First make the call that shows the handle: look at the page, which lists each control under its handle, "
  + "or for a list's extraction handle detect the list's repeating structure from one of its items, which mints the handle and its fields. "
  + "Once a call has shown it, this same call may be made again with the handle exactly as shown. Repeats refused in a row end this round, and the Flow so far is then tested and judged.";

/**
 * Said instead for a call that runs the draft, made again on the same draft and
 * page after it changed nothing (`same_draft`): `run-musr9pv3-f4bf6256` sent
 * one passing `core.run_flow` about twenty times over an unchanged draft.
 */
const DRAFT_INSTRUCTION = "This exact call -- the same tool with the same input -- already ran on this unchanged draft and this unchanged page, and changed nothing: its result is shown above, under sameAsCall. "
  + "Running it again on the same draft and page gives the same result, so it was not run. "
  + "If that result, or a refused completion, says something is wrong, change the draft first (amend_draft: reorder, bind, mark optional, rerun with a corrected argument, add or drop the steps it names), then run it again; "
  + "if nothing is wrong, do the next thing the instruction needs. Completing again over an unchanged draft that was refused is refused the same way. "
  + "Repeats refused in a row, and completions refused again over the same draft, end this round, and the Flow so far is then tested and judged.";

/** The instruction for one earlier outcome: a look, a part run, a handle never shown, or any other call. */
function instructionFor(earlier: AutomationStudioLlmEvidenceRepeatedOutcome): string {
  if (earlier.outcome === "same_answer") return LOOK_INSTRUCTION;
  if (earlier.outcome === "same_draft") return DRAFT_INSTRUCTION;
  return earlier.handleUnshown ? HANDLE_UNSHOWN_INSTRUCTION : INSTRUCTION;
}

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
      ...(input.earlier.resultReason ? { resultReason: input.earlier.resultReason } : {}),
      ...(input.earlier.handleUnshown ? { handleUnshown: true } : {})
    },
    refusedInARow: input.inARow,
    maxRefusedInARow: AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_REFUSED_REPEATS_IN_A_ROW,
    instruction: instructionFor(input.earlier)
  };
}
