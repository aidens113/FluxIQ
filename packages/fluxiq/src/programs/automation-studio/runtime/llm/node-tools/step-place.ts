// A rerun runs from its step's own place in the Flow, never from wherever the
// last call left the target.
//
// **The failure this closes (lane C, t194 runs 11 and 12, earbuds).** A list
// read paginated to page 5, which left the page there. Every rerun of that read
// -- the model correcting its filter -- was then sent as an ordinary call, ran
// on page 5, read one page of 11 items, and answered unfiltered: 0 of 13 rows,
// in the build and in all nine re-author reruns (`run-muq4oaof-464f5bce`,
// `run-muq66ff9-cb3767a1`). The step had recorded where it started; nothing
// used it.
//
// **The rule.** Before a rerun, the target is put back where the step it
// replaces found it: the same reset a replay sends, `{ replay: "reset", from }`
// with that step's own `replay.from` (`./replay.ts`), through the same executor,
// so the same permission gate answers it. A rerun is one step done again, not a
// replay of the Flow from its start, so this belongs to exploration as much as
// to repair.
//
// - A step that recorded no `from` runs where it is: nothing says where else.
// - A step whose recorded page is the page the loop last saw runs where it is,
//   without a reset that would throw away what the page holds.
// - A reset that did not put the target back runs nothing: the rerun is
//   answered with that failure (`rerun_place_unreachable`), never with a read
//   of whatever the target shows.
// - What a reset puts back is what `from` names -- for the web, an address --
//   and nothing a press built on that address. So after a reset that put the
//   target back, the proposed steps just before the replaced one that started
//   on that same place are done again, in order: the longest unbroken run of
//   proposed steps before it whose `from` is its `from` (a step that is not
//   proposed is not in the Flow, and neither breaks the run nor joins it).
//   Each is sent the way a replay sends it (`./replay-draft.ts`,
//   `automationStudioFlowDraftReplaySteps`), under `<callId>.place.<position>`:
//   a step whose effect lasts is checked and not repeated, and a step that does
//   not replay is passed over when the test from the start passes it over --
//   one the Flow would not always run (`../../flow-draft/routing.ts`), one whose
//   run a checked step withheld (`../../flow-draft/verify-only.ts`), one the
//   replay proves is only sometimes there (`../../flow-draft/sometimes-present.ts`).
//   Any other step that does not replay makes the rerun unreachable, answered
//   with that step's failure, and the rerun runs nothing. The answer names the
//   steps done again, so the rerun reads as running after them.
//
// **The failure that added the last rule (t193 lane B, `run-muqiojz4-04a7a8fc`,
// bigbox cart).** Draft step 9 pressed "+" on the towel page and step 10 pressed
// Add to cart there. The rerun of step 10 reset the target to the towel page's
// address, which brought the page back at quantity 1 (steps 0059-0061, a toast
// reading "Qty 1"); the model then "fixed" the quantity by rerunning step 10 as
// "+" (steps 0063-0065), and the Flow lost its Add to cart.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import {
  automationStudioFlowDraftConditionalStepIds,
  automationStudioFlowDraftDryRunVerdict,
  automationStudioFlowDraftReplayOutcomeWord,
  automationStudioFlowDraftSometimesPresentStepIds,
  automationStudioFlowDraftStepIsProposed,
  automationStudioFlowDraftWithheldStepIds,
  type AutomationStudioFlowDraftReplayOutcome,
  type AutomationStudioFlowDraftStep
} from "../../flow-draft/index.ts";
import { automationStudioLlmEvidenceParseToolExecutionResult } from "../evidence-loop-decision.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../evidence-loop.ts";
import { automationStudioFlowDraftReplaySteps } from "./replay-draft.ts";
import { AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES, automationStudioNodeReplayResetCall, automationStudioNodeReplayToolId } from "./replay.ts";

/** The result code of a rerun that ran nothing, because its step's place could not be put back. */
export const AUTOMATION_STUDIO_NODE_RERUN_PLACE_UNREACHABLE_CODE = "llm_evidence_loop.rerun_place_unreachable";

/** One step done again after the reset and before the rerun: which step, under which call, and the word its outcome reads under. */
export type AutomationStudioNodeRerunDoneAgain = { step: number; stepId?: string; actionId: string; callId: string; outcome: string };

/** Where a rerun runs: as the target stands, after it was put back, or nowhere. */
export type AutomationStudioNodeRerunPlace =
  | { kind: "in_place" }
  /** `doneAgain` is the steps done again after the reset, in order; empty when none before it started on its place. */
  | { kind: "put_back"; callId: string; doneAgain: AutomationStudioNodeRerunDoneAgain[] }
  /** `result` is what the rerun is answered with, in place of running it. */
  | { kind: "unreachable"; callId: string; result: AutomationStudioLlmEvidenceToolExecutionResult };

/** Puts the target back where `step` found it, with what the steps before it built there, when it is not there already. */
export async function automationStudioNodeRerunFromItsPlace(input: {
  step: AutomationStudioFlowDraftStep;
  /** The draft `step` is in: the proposed steps before it that started on its place are done again. */
  steps: readonly AutomationStudioFlowDraftStep[];
  /** The state the loop last saw the target in, when it saw one. */
  now: string | undefined;
  /** The rerun's own call id; the reset is sent as `<callId>.place`, each step done again as `<callId>.place.<position>`. */
  callId: string;
  executeTool(request: { callId: string; toolId: string; value: JsonObject; signal?: AbortSignal }): Promise<JsonValue | AutomationStudioLlmEvidenceToolExecutionResult>;
  signal?: AbortSignal | undefined;
}): Promise<AutomationStudioNodeRerunPlace> {
  const from = input.step.replay?.from;
  if (!from || (input.now !== undefined && input.now === input.step.stateBefore)) return { kind: "in_place" };
  const callId = `${input.callId}.place`;
  let answered: ReturnType<typeof automationStudioLlmEvidenceParseToolExecutionResult>;
  try {
    const ran = await input.executeTool({ callId, toolId: automationStudioNodeReplayToolId(input.step), value: automationStudioNodeReplayResetCall(from), ...(input.signal ? { signal: input.signal } : {}) });
    answered = automationStudioLlmEvidenceParseToolExecutionResult(ran, "mutate");
  } catch (error) {
    if (input.signal?.aborted) throw error;
    answered = undefined;
  }
  if (answered?.resultCode !== AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES.replayed || answered.effectApplied !== true) {
    return unreachable(callId, "that page could not be put back", answered ? { putBack: answered.evidence } : {});
  }
  const run = stepsBefore(input.steps, input.step);
  if (!run.length) return { kind: "put_back", callId, doneAgain: [] };
  const done = await automationStudioFlowDraftReplaySteps({
    executeTool: input.executeTool,
    ...(input.signal ? { signal: input.signal } : {}),
    steps: input.steps,
    run,
    callIdOf: (step) => `${callId}.${step.position}`,
    // Every step of the run starts on the place the reset just put back, so
    // asking one again "on its own page" would only reset away the others.
    reanchor: false
  });
  const doneAgain = done.outcomes.map((outcome): AutomationStudioNodeRerunDoneAgain => ({
    step: outcome.step,
    ...(outcome.stepId === undefined ? {} : { stepId: outcome.stepId }),
    actionId: outcome.actionId,
    callId: `${callId}.${outcome.step}`,
    outcome: automationStudioFlowDraftReplayOutcomeWord(outcome)
  }));
  const failed = firstBlocking(input.steps, done.outcomes);
  if (!failed) return { kind: "put_back", callId, doneAgain };
  const seen = done.observations.find((observation) => observation.step === failed.step);
  return unreachable(callId, `step ${failed.step} before it, which started on the same page, could not be done again`, {
    doneAgain,
    failedStep: { step: failed.step, actionId: failed.actionId, outcome: automationStudioFlowDraftReplayOutcomeWord(failed), ...(seen ? { evidence: seen.evidence } : {}) }
  });
}

/**
 * The proposed steps just before `step` that started where it did: walking back
 * from it over the proposed steps while each one's `from` is its `from`. Both
 * `from` values are the caller's and are compared whole, never read.
 */
function stepsBefore(steps: readonly AutomationStudioFlowDraftStep[], step: AutomationStudioFlowDraftStep): AutomationStudioFlowDraftStep[] {
  const place = JSON.stringify(step.replay?.from);
  const at = steps.indexOf(step);
  const earlier = (at >= 0 ? steps.slice(0, at) : steps.filter((each) => each.position < step.position)).filter(automationStudioFlowDraftStepIsProposed);
  const run: AutomationStudioFlowDraftStep[] = [];
  for (const each of earlier.reverse()) {
    if (each.replay?.from === undefined || JSON.stringify(each.replay.from) !== place) break;
    run.unshift(each);
  }
  return run;
}

/**
 * The first step done again that did not replay and that the test from the
 * start would not pass over either: not one the Flow would not always run, not
 * one whose run a checked step withheld, and not one the replay proves is only
 * sometimes there -- the three `./dry-run-gate.ts` passes over. The draft is
 * not rewritten here: a step the gate would make optional is only passed.
 */
function firstBlocking(steps: readonly AutomationStudioFlowDraftStep[], outcomes: readonly AutomationStudioFlowDraftReplayOutcome[]): AutomationStudioFlowDraftReplayOutcome | undefined {
  const excused = new Set([...automationStudioFlowDraftConditionalStepIds(steps), ...automationStudioFlowDraftWithheldStepIds(outcomes)]);
  const verdict = automationStudioFlowDraftDryRunVerdict({ attempt: 0, reset: "ok", outcomes, conditional: excused });
  if (verdict.ok) return undefined;
  for (const id of automationStudioFlowDraftSometimesPresentStepIds({ steps, verdict })) excused.add(id);
  return outcomes.find((outcome) => outcome.status !== "replayed" && !(outcome.stepId !== undefined && excused.has(outcome.stepId)));
}

/** The answer a rerun gets in place of running: nothing ran, and why. */
function unreachable(callId: string, why: string, more: JsonObject): AutomationStudioNodeRerunPlace {
  return {
    kind: "unreachable",
    callId,
    result: {
      kind: "llm_evidence_tool_execution",
      effectApplied: false,
      resultCode: AUTOMATION_STUDIO_NODE_RERUN_PLACE_UNREACHABLE_CODE,
      evidence: {
        ok: false,
        code: "rerun_place_unreachable",
        detail: `Nothing was run. A rerun runs from the page its step started on, with what the steps before it did there, and ${why}, so reading or acting here would not be that step.`,
        ...more
      }
    }
  };
}
