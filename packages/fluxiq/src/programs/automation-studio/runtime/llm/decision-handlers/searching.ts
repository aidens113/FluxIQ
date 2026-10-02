// What the loop does about a run of looks with nothing done between them
// (`../repeat-guard/searching.ts`): at the note's count the model is told it
// has been searching without acting, with the looks it made and where their
// answers are, and pushed to act; at the run's limit the round stalls, as
// refused repeats in a row do (`./refused-repeat.ts`). Codes and Core's own
// sentences: a look's input is the model's own, and no page value is quoted.

import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioLlmDecisionContextSupersede } from "../decision-context/index.ts";
import { automationStudioLlmEvidenceCanonicalJson } from "../evidence-loop-decision.ts";
import { automationStudioLlmEvidenceLoopFailure as failure } from "../evidence-loop/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_LOOKS_IN_A_ROW, AUTOMATION_STUDIO_LLM_EVIDENCE_SEARCH_NOTE_AT } from "../repeat-guard/index.ts";
import type { AutomationStudioLlmEvidenceDecisionHandlerContext } from "./types.ts";

/** The entry the note is shown under; a newer one replaces the older. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_SEARCH_CHECK_TOOL_ID = "core.search_check";

/** The code the note carries, and the round stalls under. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_SEARCHING_CODE = "llm_evidence_loop.searching_without_acting";

/** The longest look input listed whole; a longer one is listed by its call id alone. */
const MAX_LISTED_INPUT = 300;

const INSTRUCTION = "You have looked at or searched the page this many times in a row, and nothing changed between them: no control was used and the page did not move. "
  + "Their answers are above, under the call ids listed here, and looking again will not change the page. "
  + "Act on what you found: press, type into or choose a control the page shows, go to another page, use the page's own search or menus, or amend or complete the draft. "
  + "If what you need is not on this page, go where it is. Looks in a row up to maxLooksInARow end this round, and the Flow so far is then tested and judged.";

/**
 * Says what the run of looks so far calls for: nothing, the note, or the end
 * of the round -- the error the caller built for a stall, or the loop's own
 * ending where it built none.
 */
export function automationStudioLlmEvidenceSearchingWithoutActing(
  context: AutomationStudioLlmEvidenceDecisionHandlerContext,
  iteration: number
): { kind: "stalled"; error: unknown } | { kind: "end"; result: ReturnType<typeof failure> } | undefined {
  const { input, trace, accounting, draftSteps, evidence } = context;
  const looks = context.repeats.looks();
  if (looks.length >= AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_LOOKS_IN_A_ROW) {
    if (input.unusableDecisions) {
      return { kind: "stalled", error: input.unusableDecisions.stalled({ issueCodes: [AUTOMATION_STUDIO_LLM_EVIDENCE_SEARCHING_CODE], trace: [...trace], accounting: { ...accounting }, steps: draftSteps.map((step) => structuredClone(step)) }) };
    }
    return { kind: "end", result: failure(draftSteps, "llm_evidence_loop.repeat_without_progress", trace, accounting) };
  }
  if (looks.length !== AUTOMATION_STUDIO_LLM_EVIDENCE_SEARCH_NOTE_AT) return undefined;
  const note: JsonObject = {
    code: AUTOMATION_STUDIO_LLM_EVIDENCE_SEARCHING_CODE,
    looksInARow: looks.length,
    maxLooksInARow: AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_LOOKS_IN_A_ROW,
    looks: looks.map((look) => ({
      callId: look.callId,
      toolId: look.toolId,
      ...(automationStudioLlmEvidenceCanonicalJson(look.input).length <= MAX_LISTED_INPUT ? { input: look.input } : {})
    })),
    instruction: INSTRUCTION
  };
  context.accountEvidence(note);
  automationStudioLlmDecisionContextSupersede(evidence, AUTOMATION_STUDIO_LLM_EVIDENCE_SEARCH_CHECK_TOOL_ID);
  evidence.push({ callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_SEARCH_CHECK_TOOL_ID}.${iteration}`, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_SEARCH_CHECK_TOOL_ID, value: note });
  return undefined;
}
