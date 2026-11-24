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
// in that sentence's place, with its tool under `next`. A loop that offers
// `core.run_node` is also told how a press is made (t1008); every other loop's
// note is byte for byte as it was.
//
// On a caller with `loopSignal` (a loop no count ends) there is no stall: the
// run of looks is a `no_progress` finding on loop detection's ladder, steered
// and decided by the model as any repeat is (t1008).

import type { JsonObject } from "../../../core/index.ts";
import { automationStudioFlowDraftStepCopy } from "../../flow-authoring/draft/index.ts";
import { automationStudioLlmDecisionContextSupersede } from "../decision-context/index.ts";
import { automationStudioLlmEvidenceCanonicalJson } from "../evidence-loop-decision.ts";
import { automationStudioLlmEvidenceLoopFailure as failure } from "../evidence-loop/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_LOOKS_IN_A_ROW, AUTOMATION_STUDIO_LLM_EVIDENCE_SEARCH_NOTE_AT, type AutomationStudioLlmLoopFinding } from "../repeat-guard/index.ts";
import { automationStudioLlmEvidenceLoopCaught } from "./loop-check.ts";
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
const ACT = LOOKED
  + "Act on what you found: press, type into or choose a control the page shows, go to another page, use the page's own search or menus, or amend or complete the draft. "
  + "If what you need is not on this page, go where it is.";
const INSTRUCTION = `${ACT} At maxLooksInARow looks in a row the searching is stopped: what you have built so far is then tested and judged where it still can be, and the build ends only when nothing is left to test.`;
/** A loop no count ends (t1008): nothing is stopped at maxLooksInARow, and the run is caught as a repeat. */
const UNCOUNTED_INSTRUCTION = `${ACT} At maxLooksInARow looks in a row the run of looks is caught as a repeat, and you decide how to go on.`;
const PLANNING_STOP = " At maxLooksInARow looks in a row the searching is stopped.";
/**
 * How a loop that runs library nodes acts (t1008). "Press" alone named no tool: the only tools that take a
 * handle directly are looks, and a live run (`run-mwufisf0-5535f5f5`) answered this note by describing the
 * control it meant to press, again and again.
 */
const HOW_TO_ACT = " A look never presses: to press, type into or choose a control, call core.run_node with the node from the catalog that does it, naming the control under target as {\"handle\": \"<its handle>\"}.";

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
    // A loop no count ends (a caller on the single-loop path, `../loop-configuration.ts`, `uncounted`) is not stalled by
    // its count of looks: the run is loop detection's `no_progress`, steered and decided by the model as any repeat is,
    // and each further look that brings nothing counts on its ladder (t1008). Before this the round ended here and a
    // fresh one, told nothing of what it had looked at, looked at the same things again: four rounds of
    // run-mwufisf0-5535f5f5 in a row.
    if (input.loopSignal) {
      automationStudioLlmEvidenceLoopCaught(context, iteration, looksFinding(looks));
      return undefined;
    }
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
    instruction: forward ? `${LOOKED}${forward.instruction}${PLANNING_STOP}` : `${input.loopSignal ? UNCOUNTED_INSTRUCTION : INSTRUCTION}${context.toolIds.has(RUN_NODE_TOOL_ID) ? HOW_TO_ACT : ""}`
  };
  context.accountEvidence(note);
  automationStudioLlmDecisionContextSupersede(evidence, AUTOMATION_STUDIO_LLM_EVIDENCE_SEARCH_CHECK_TOOL_ID);
  evidence.push({ callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_SEARCH_CHECK_TOOL_ID}.${iteration}`, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_SEARCH_CHECK_TOOL_ID, value: note });
  return undefined;
}
