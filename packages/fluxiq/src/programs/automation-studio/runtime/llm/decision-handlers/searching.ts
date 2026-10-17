// What the loop does about a run of looks with nothing done between them
// (`../repeat-guard/searching.ts`): at the note's count the model is told it
// has been searching without acting, with the looks it made and where their
// answers are, and pushed to act; at the run's limit the round stalls, as
// refused repeats in a row do (`./refused-repeat.ts`) -- unless the caller
// still has a move that may get the build further, which runs instead
// (`./stall-recovery.ts`, t477). Codes and Core's own sentences: a look's input
// is the model's own, and no page value is quoted.
//
// A loop that plans rather than acts (`planning`,
// `../evidence-progress/planning-tools.ts`, t569) is never told to press, type
// or go to another page, which it cannot do: the note says its own way forward
// in that sentence's place, with its tool under `next`. Every other loop's note
// is byte for byte as it was.

import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioFlowDraftStepCopy } from "../../flow-draft/index.ts";
import { automationStudioLlmDecisionContextSupersede } from "../decision-context/index.ts";
import { automationStudioLlmEvidenceCanonicalJson } from "../evidence-loop-decision.ts";
import { automationStudioLlmEvidenceLoopFailure as failure } from "../evidence-loop/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_LOOKS_IN_A_ROW, AUTOMATION_STUDIO_LLM_EVIDENCE_SEARCH_NOTE_AT } from "../repeat-guard/index.ts";
import { automationStudioLlmEvidenceStallRecovery, type AutomationStudioLlmEvidenceStallOutcome } from "./stall-recovery.ts";
import type { AutomationStudioLlmEvidenceDecisionHandlerContext } from "./types.ts";

/** The entry the note is shown under; a newer one replaces the older. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_SEARCH_CHECK_TOOL_ID = "core.search_check";

/** The code the note carries, and the round stalls under. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_SEARCHING_CODE = "llm_evidence_loop.searching_without_acting";

/** The longest look input listed whole; a longer one is listed by its call id alone. */
const MAX_LISTED_INPUT = 300;

const LOOKED = "You have looked at or searched the page this many times in a row, and nothing changed between them: no control was used and the page did not move. "
  + "Their answers are above, under the call ids listed here, and looking again will not change the page. ";
const INSTRUCTION = LOOKED
  + "Act on what you found: press, type into or choose a control the page shows, go to another page, use the page's own search or menus, or amend or complete the draft. "
  + "If what you need is not on this page, go where it is. At maxLooksInARow looks in a row the searching is stopped: what you have built so far is then tested and judged where it still can be, and the build ends only when nothing is left to test.";
const PLANNING_STOP = " At maxLooksInARow looks in a row the searching is stopped.";

/**
 * Says what the run of looks so far calls for: nothing, the note, the call
 * the caller recovers the stall with (`./stall-recovery.ts`), or the end of
 * the round -- the error the caller built for a stall, or the loop's own
 * ending where it built none.
 */
export function automationStudioLlmEvidenceSearchingWithoutActing(
  context: AutomationStudioLlmEvidenceDecisionHandlerContext,
  iteration: number
): { kind: "stalled"; error: unknown } | { kind: "end"; result: ReturnType<typeof failure> } | Extract<AutomationStudioLlmEvidenceStallOutcome, { kind: "recover" }> | undefined {
  const { input, trace, accounting, draftSteps, evidence } = context;
  const looks = context.repeats.looks();
  if (looks.length >= AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_LOOKS_IN_A_ROW) {
    if (input.unusableDecisions) {
      const stall = automationStudioLlmEvidenceStallRecovery(context, iteration, [AUTOMATION_STUDIO_LLM_EVIDENCE_SEARCHING_CODE]);
      if (stall.kind === "recover") return stall;
      return { kind: "stalled", error: input.unusableDecisions.stalled({ issueCodes: stall.issueCodes, trace: [...trace], accounting: { ...accounting }, steps: draftSteps.map((step) => automationStudioFlowDraftStepCopy(step)) }) };
    }
    return { kind: "end", result: failure(draftSteps, "llm_evidence_loop.repeat_without_progress", trace, accounting) };
  }
  if (looks.length !== AUTOMATION_STUDIO_LLM_EVIDENCE_SEARCH_NOTE_AT) return undefined;
  const forward = input.planning?.next();
  const note: JsonObject = {
    code: AUTOMATION_STUDIO_LLM_EVIDENCE_SEARCHING_CODE,
    looksInARow: looks.length,
    maxLooksInARow: AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_LOOKS_IN_A_ROW,
    looks: looks.map((look) => ({
      callId: look.callId,
      toolId: look.toolId,
      ...(automationStudioLlmEvidenceCanonicalJson(look.input).length <= MAX_LISTED_INPUT ? { input: look.input } : {})
    })),
    ...(forward?.toolId ? { next: forward.toolId } : {}),
    instruction: forward ? `${LOOKED}${forward.instruction}${PLANNING_STOP}` : INSTRUCTION
  };
  context.accountEvidence(note);
  automationStudioLlmDecisionContextSupersede(evidence, AUTOMATION_STUDIO_LLM_EVIDENCE_SEARCH_CHECK_TOOL_ID);
  evidence.push({ callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_SEARCH_CHECK_TOOL_ID}.${iteration}`, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_SEARCH_CHECK_TOOL_ID, value: note });
  return undefined;
}
