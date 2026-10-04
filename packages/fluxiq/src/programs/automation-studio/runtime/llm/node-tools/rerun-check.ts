// How a rerun is answered: run as asked, or -- for a step whose instructed act
// was already done -- checked with the new argument and not done again.
//
// **The failure this closes (live run `run-murwcaj0-40e56557`, R7, lane D,
// round 1002-M).** Step 6 confirmed Amara's friend request as act a1 in round 0
// (steps 0023-0024). In the repair round the model amended `rerun` of step 6
// with `target: {handle: t744}` (step 0066), and t744 was Tom Becker's Confirm.
// The rerun ran live: the page was put back, the listing replayed, Confirm
// pressed (steps 0067-0069), and "Request accepted" appeared on Tom's card -- a
// request the instruction said to leave alone. The build had already done the
// act once; the rerun did it a second time, to someone else.
//
// **The rule (decision D1, `../../flow-draft/verify-only.ts`).** A build never
// repeats a lasting effect while it builds. A rerun of a step the dry run
// would check -- lasting by its declaration or by the instruction's lasting
// acts (`lastingActs`, t174-w83) -- whose own run already did its effect
// (`automationStudioFlowDraftStepActDone`) is sent, after the usual put-back
// (`./step-place.ts`), as the dry run's check: the new argument with
// `replay: "verify"` and where the step found the page (`./replay.ts`). The host
// acts on nothing and answers in the replay's closed vocabulary:
//
//   verified, present -- the step takes the new argument (and the resolved form
//                        the host answered with, when it answered one), and the
//                        amendments held for the rerun apply to it.
//   anything else     -- the rerun is refused like one that did not work: the
//                        step keeps the argument it ran with.
//
// Either way the answer says so in plain words (`rerunCheck`): checked and not
// done again, because the act was already done once while building, and that
// when the Flow runs the step does its act each time -- a repeated step on each
// row its listing keeps.
//
// **What this is not.** It is not a refusal and it narrows nothing the model may
// do (user, 2026-10-01: no restrictions beyond permissions): a plain call is run
// exactly as asked, and so is a rerun of any step that does no act or has not
// done it. Only a rerun of a done act -- the one call whose whole meaning is
// "this step, again" -- is checked rather than repeated.
//
// **The resolved form.** A step's `ranWith` is what the Flow runs (a selector,
// for the web), and the old one names the old target. When the check's answer
// carries no resolved form of the new argument, `ranWith` is dropped rather than
// kept under the new argument's name: Amara's selector beside Tom's handle would
// confirm Amara's request on every run while the draft showed Tom.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import {
  AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_PRESENT_CODE,
  AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_VERIFIED_CODE,
  automationStudioFlowDraftStepActDone,
  type AutomationStudioFlowDraftStep,
  type AutomationStudioFlowDraftStepWords
} from "../../flow-draft/index.ts";
import { automationStudioLlmEvidenceParseToolExecutionResult } from "../evidence-loop-decision.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../evidence-loop.ts";
import { AUTOMATION_STUDIO_NODE_REPLAY_KEY } from "./replay.ts";
import { automationStudioNodeRerunPlaceNoted, type AutomationStudioNodeRerunPlace } from "./step-place.ts";

type Answer = JsonValue | AutomationStudioLlmEvidenceToolExecutionResult;

/** The key a checked rerun's answer explains itself under. */
const RERUN_CHECK_KEY = "rerunCheck";

/**
 * Runs one call the loop decided -- a rerun from the place `place` put it back
 * to, or an ordinary call when there is no `replaces` -- and answers what it
 * returned, with where a rerun ran. `took` is whether a checked rerun's step now
 * runs with the new argument (see the header); it is false for every call that
 * was run as asked.
 */
export async function automationStudioNodeRerunAnswer(input: {
  place: AutomationStudioNodeRerunPlace | undefined;
  /** The step the rerun replaces; absent for an ordinary call. */
  replaces: AutomationStudioFlowDraftStep | undefined;
  /** The draft in execution order: later test evidence depends on the replaced configuration. */
  steps?: readonly AutomationStudioFlowDraftStep[] | undefined;
  call: { callId: string; toolId: string; value: JsonObject };
  /** What the call names in the domain's words, asked before it ran (`../../flow-draft/step-words.ts`). */
  words?: AutomationStudioFlowDraftStepWords | undefined;
  executeTool(request: { callId: string; toolId: string; value: JsonObject; signal?: AbortSignal }): Promise<Answer>;
  signal?: AbortSignal | undefined;
  /** The instruction's lasting acts, as the dry run reads them (`../../flow-draft/verify-only.ts`, t174-w83). */
  lastingActs?: ReadonlySet<string> | undefined;
}): Promise<{ ran: Answer; took: boolean }> {
  if (input.place?.kind === "unreachable") return { ran: input.place.result, took: false };
  const step = input.replaces !== undefined && automationStudioFlowDraftStepActDone(input.replaces, input.lastingActs) ? input.replaces : undefined;
  const value = step ? checkCall(step, input.call.value) : input.call.value;
  // A refusal after a put-back says the page was loaded again and names the control the argument meant (`./step-place.ts`, run `run-musq0b1m-0472cfa0` Cause 4).
  const named = input.replaces ? { step: input.replaces.position, ...(input.words ? { words: input.words } : {}) } : undefined;
  const ran = automationStudioNodeRerunPlaceNoted(input.place, await input.executeTool({ callId: input.call.callId, toolId: input.call.toolId, value, ...(input.signal ? { signal: input.signal } : {}) }), named);
  return step ? checked(step, input.call.callId, input.call.toolId, input.call.value, input.words, ran, input.steps) : { ran, took: false };
}

/** The dry run's check of `step`, with the rerun's new argument in place of what the step ran with (`./replay.ts`). */
function checkCall(step: AutomationStudioFlowDraftStep, value: JsonObject): JsonObject {
  return { ...value, [AUTOMATION_STUDIO_NODE_REPLAY_KEY]: "verify", ...(step.replay?.from === undefined ? {} : { from: step.replay.from }) };
}

/** What a check's answer does to the step, and the answer with the plain account of it. */
function checked(step: AutomationStudioFlowDraftStep, callId: string, toolId: string, value: JsonObject, words: AutomationStudioFlowDraftStepWords | undefined, ran: Answer, steps: readonly AutomationStudioFlowDraftStep[] | undefined): { ran: Answer; took: boolean } {
  const parsed = automationStudioLlmEvidenceParseToolExecutionResult(ran, "mutate");
  const code = parsed?.resultCode;
  const took = code === AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_VERIFIED_CODE || code === AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_PRESENT_CODE;
  const position = step.position;
  const acts = [...(step.acts ?? [])];
  if (took) {
    if (!step.priorExecution) {
      const { priorExecution: _prior, checkedCandidate: _candidate, ...performed } = step;
      step.priorExecution = { ...structuredClone(performed), lasting: true };
    }
    // The caller's parsed declaration is the same authority normal callRecord
    // uses. A checked replacement can change which action a shared tool runs:
    // carrying its arguments under the earlier action would assemble that old
    // node with the replacement's parameters. Never infer identity from an
    // arbitrary argument such as value.node.
    const declared = parsed?.draft;
    if (declared?.actionId !== undefined) {
      step.actionId = declared.actionId;
      if (declared.actionId === toolId) delete step.toolId;
      else step.toolId = toolId;
    }
    step.input = declared?.input ?? value;
    if (declared?.effect !== undefined) step.effect = declared.effect;
    if (declared?.proposes !== undefined) step.proposes = declared.proposes;
    step.effectApplied = false;
    step.checkedCandidate = { callId, code: code! };
    step.resultCode = code;
    // Proof of the previous execution remains solely under its old input.
    delete step.callId;
    delete step.stateBefore;
    delete step.stateAfter;
    delete step.instance;
    delete step.toggle;
    delete step.interruption;
    delete step.cancels;
    delete step.routeSignatures;
    delete step.written;
    if (step.replay?.from !== undefined) step.replay = { from: step.replay.from };
    else delete step.replay;
    const resolved = parsed?.draft?.ranWith;
    if (resolved !== undefined) step.ranWith = resolved;
    else delete step.ranWith;
    if (words) step.words = words;
    else delete step.words;
    // The words of the control the earlier run pressed: the old target's, not this one's.
    delete step.control;
    // How the old argument answered the last test is not about this one (run `run-musq0b1m-0472cfa0`, Cause 6).
    delete step.replayed;
    // Any following result was measured with the old configuration before it.
    const at = steps?.indexOf(step) ?? -1;
    if (steps && at >= 0) for (const following of steps.slice(at + 1)) delete following.replayed;
  }
  const why = `Step ${position} replaces an original configuration that already did it once while this Flow was being built: a lasting effect was performed. This rerun was checked and not done again; that history prevents a second execution, but does not prove the replacement configuration or its current act claims were performed.`;
  const found = code === AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_PRESENT_CODE
    ? "The check reported the effect present on the recorded page; this is not proof that the replacement configuration was performed"
    : "The check found the step could run now with the new argument";
  const detail = took
    ? `${why} ${found}, so step ${position} now holds the new argument as a checked candidate, not performed evidence. Its act claims describe intention; the earlier execution remains tied to the original argument. When the Flow runs, the step does its act each time it runs: a repeated step does it on each row its listing keeps.`
    : `${why} The check did not find the step able to run with the new argument on the page it started on (${code ?? "no answer"}), so nothing changed: step ${position} keeps the argument it ran with, as after a rerun that did not work.`;
  return { ran: noted(ran, { checked: true, doneAgain: false, acts, ...(code ? { answer: code } : {}), took, detail }), took };
}

/** The answer with the check's account written into its evidence object, as `./step-place.ts` writes `rerunPlace`. */
function noted(ran: Answer, note: JsonObject): Answer {
  if (!isObject(ran)) return ran;
  if (ran.kind !== "llm_evidence_tool_execution") return { ...ran, [RERUN_CHECK_KEY]: note };
  const execution = ran as AutomationStudioLlmEvidenceToolExecutionResult;
  return isObject(execution.evidence) ? { ...execution, evidence: { ...execution.evidence, [RERUN_CHECK_KEY]: note } } : ran;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
