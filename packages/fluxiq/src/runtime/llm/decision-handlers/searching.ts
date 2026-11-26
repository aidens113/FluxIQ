// What the loop does about a run of looks with nothing done between them
// (`../repeat-guard/searching.ts`): at the note's count the model is told it
// has been searching without acting, with the looks it made and where their
// answers are, and pushed to act; from the run's count on it is a `no_progress`
// finding on loop detection's ladder, steered and decided by the model as any
// repeat is (t1008). Codes and Core's own sentences: a look's input is the
// model's own, and no page value is quoted.
//
// **No count of looks ends a round (t1056).** It used to stall the round of
// every loop with no `loopSignal` at eight looks -- a build then tested and
// judged what it had, a candidate retested its latest revision or ended -- and
// a fresh round, told nothing of what it had looked at, looked at the same
// things again (run-mwufisf0-5535f5f5, four rounds in a row). Now every loop is
// steered: the ladder's top rung runs the caller's own move where it names one
// (`./ladder-top.ts`), and the purse ends a loop that will not stop looking.
//
// A loop that plans rather than acts (`planning`,
// `../evidence-progress/planning-tools.ts`, t569) is never told to press, type
// or go to another page, which it cannot do: the note says its own way forward
// in that sentence's place, with its tool under `next`. A loop that offers
// `core.run_node` is also told how a press is made (t1008).

import type { JsonObject } from "../../../core/index.ts";
import { automationStudioLlmDecisionContextSupersede } from "../decision-context/index.ts";
import { automationStudioLlmEvidenceCanonicalJson } from "../evidence-loop-decision.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_LOOKS_IN_A_ROW, AUTOMATION_STUDIO_LLM_EVIDENCE_SEARCH_NOTE_AT, type AutomationStudioLlmLoopFinding } from "../repeat-guard/index.ts";
import { automationStudioLlmEvidenceLoopCaught } from "./loop-check.ts";
import type { AutomationStudioLlmEvidenceDecisionHandlerContext } from "./types.ts";

/** The entry the note is shown under; a newer one replaces the older. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_SEARCH_CHECK_TOOL_ID = "core.search_check";

/** The code the note carries. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_SEARCHING_CODE = "llm_evidence_loop.searching_without_acting";

/** The longest look input listed whole; a longer one is listed by its call id alone. */
const MAX_LISTED_INPUT = 300;

const LOOKED = "You have asked about the page this many times in a row, and nothing changed between them: no control was used and the page did not move. "
  + "Their answers are above, under the call ids listed here, and asking again will not change the page. ";
const ACT = LOOKED
  + "Act on what you found: press, type into or choose a control the page shows, go to another page, use the page's own search or menus, or amend or complete the draft. "
  + "If what you need is not on this page, go where it is.";
/** Nothing is stopped at maxLooksInARow: from there the run of looks is caught as a repeat (t1008, t1056). */
const INSTRUCTION = `${ACT} At maxLooksInARow looks in a row the run of looks is caught as a repeat, and you decide how to go on.`;
const PLANNING_CAUGHT = " At maxLooksInARow looks in a row the run of looks is caught as a repeat, and you decide how to go on.";
/**
 * How a loop that runs library nodes acts (t1008). "Press" alone named no tool: the only tools that take a
 * handle directly are looks, and a live run (`run-mwufisf0-5535f5f5`) answered this note by describing the
 * control it meant to press, again and again.
 */
const HOW_TO_ACT = " Asking about the page never presses: to press, type into or choose a control, call core.run_node with the node from the catalog that does it, naming the control under target as {\"handle\": \"<its handle>\"}.";

/** The tool a loop that runs library nodes acts through, restated from `../node-tools/run/node.ts` rather than imported, as `../evidence-loop-decision.ts` does. */
const RUN_NODE_TOOL_ID = "core.run_node";

/**
 * The run of looks as loop detection names it (t1008): calls that each ran and brought nothing new, put on
 * its ladder as the detector's own findings are.
 */
function looksFinding(looks: readonly { callId: string; toolId: string }[]): AutomationStudioLlmLoopFinding {
  const last = looks.at(-1);
  return { pattern: "no_progress", repeats: looks.length, toolIds: [...new Set(looks.map((look) => look.toolId))], unchanged: ["page", "rows", "acts", "draft"], ...(last ? { callId: last.callId } : {}) };
}

/**
 * Tells the model about the run of looks so far, or puts it on loop detection's ladder from the run's count on.
 * Ends nothing: the ladder's top rung is the loop's to act on after the call (`./loop-check.ts`, `./ladder-top.ts`).
 */
export function automationStudioLlmEvidenceSearchingWithoutActing(context: AutomationStudioLlmEvidenceDecisionHandlerContext, iteration: number): undefined {
  const { input, evidence } = context;
  const looks = context.repeats.looks();
  if (looks.length >= AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_LOOKS_IN_A_ROW) {
    automationStudioLlmEvidenceLoopCaught(context, iteration, looksFinding(looks));
    return undefined;
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
    instruction: forward ? `${LOOKED}${forward.instruction}${PLANNING_CAUGHT}` : `${INSTRUCTION}${context.toolIds.has(RUN_NODE_TOOL_ID) ? HOW_TO_ACT : ""}`
  };
  context.accountEvidence(note);
  automationStudioLlmDecisionContextSupersede(evidence, AUTOMATION_STUDIO_LLM_EVIDENCE_SEARCH_CHECK_TOOL_ID);
  evidence.push({ callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_SEARCH_CHECK_TOOL_ID}.${iteration}`, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_SEARCH_CHECK_TOOL_ID, value: note });
  return undefined;
}
