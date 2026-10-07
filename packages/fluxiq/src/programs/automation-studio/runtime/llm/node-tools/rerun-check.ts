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
//                        amendments held for the rerun apply to it -- only when
//                        the argument is the step as it ran with new values
//                        (below).
//   anything else     -- the rerun is refused like one that did not work: the
//                        step keeps the argument it ran with.
//
// **A check that ran nothing keeps the step as it ran.** It may take new values
// for parameters the step ran with, on the control it ran on -- a corrected
// text, a binding -- and nothing else: not another action, not another control,
// not a parameter the step never ran with. Live run `run-muxkzdjw-31a13429`
// (lane A round 4, C2b): step 13 pressed "Get coupons" and did the lasting act
// a2; a rerun onto the "+" control (0031) was checked, ran nothing, and took, so
// the coupon act sat on an unrun "+" press; a rerun with `{target: t964, text:
// "3"}` (0075) took again and left a click holding a `text`. The lane D design
// this replaces let a check move a done act to another row's control (run
// `run-murwcaj0-40e56557`, R7): it never ran there, so nothing showed it would.
// "Another control" is read from the argument itself: a target parameter
// (`target`, `selector`, `element`) given a value the step neither was shown nor
// ran with. A rerun patch that leaves the target out keeps it, so a value-only
// correction still takes. Another control, or another kind of parameter, is a
// new call with add true.
//
// **A check cannot change which action a step is.** Live run
// `run-mux74k5q-1c3c2127` (lane A round 3, C2): step 12 pressed "Spain" and
// claimed the lasting add-to-cart act, so every rerun of it was a check. The
// model's reruns to type 3 into the quantity field (`node:
// web.output.dom-type`) came back `core.replay.present` and took: the step kept
// `actionId: web.output.dom-click` and took the typing's input, completion
// compiled it as a click and refused `text` and `submit`, and the draft showed a
// type node the Flow would never run. A check runs nothing, so it declares no
// action; a value whose `node` names an action other than the step's, with no
// action declared by the answer, does not take whatever the check answered: the
// step keeps its action, input and resolved form, and the answer says the check
// ran nothing and that a different action is a new call with add true. The
// action is never inferred from `value.node` -- this refuses, it does not infer.
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
import { automationStudioLlmEvidenceCanonicalJson, automationStudioLlmEvidenceParseToolExecutionResult } from "../evidence-loop-decision.ts";
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
 * was run as asked. `checked` is whether the call was sent as the dry run's
 * check, which acts on nothing: the repeat guard records no attempt of its input
 * for it (`../repeat-guard/outcomes.ts`, run `run-mux74k5q-1c3c2127` C3).
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
}): Promise<{ ran: Answer; took: boolean; checked: boolean }> {
  if (input.place?.kind === "unreachable") return { ran: input.place.result, took: false, checked: false };
  const step = input.replaces !== undefined && automationStudioFlowDraftStepActDone(input.replaces, input.lastingActs) ? input.replaces : undefined;
  const value = step ? checkCall(step, input.call.value) : input.call.value;
  // A refusal after a put-back says the page was loaded again and names the control the argument meant (`./step-place.ts`, run `run-musq0b1m-0472cfa0` Cause 4).
  const named = input.replaces ? { step: input.replaces.position, ...(input.words ? { words: input.words } : {}) } : undefined;
  const ran = automationStudioNodeRerunPlaceNoted(input.place, await input.executeTool({ callId: input.call.callId, toolId: input.call.toolId, value, ...(input.signal ? { signal: input.signal } : {}) }), named);
  return step ? { ...checked(step, input.call.callId, input.call.toolId, input.call.value, input.words, ran, input.steps), checked: true } : { ran, took: false, checked: false };
}

/** The dry run's check of `step`, with the rerun's new argument in place of what the step ran with (`./replay.ts`). */
function checkCall(step: AutomationStudioFlowDraftStep, value: JsonObject): JsonObject {
  return { ...value, [AUTOMATION_STUDIO_NODE_REPLAY_KEY]: "verify", ...(step.replay?.from === undefined ? {} : { from: step.replay.from }) };
}

/** What a check's answer does to the step, and the answer with the plain account of it. */
function checked(step: AutomationStudioFlowDraftStep, callId: string, toolId: string, value: JsonObject, words: AutomationStudioFlowDraftStepWords | undefined, ran: Answer, steps: readonly AutomationStudioFlowDraftStep[] | undefined): { ran: Answer; took: boolean } {
  const parsed = automationStudioLlmEvidenceParseToolExecutionResult(ran, "mutate");
  const code = parsed?.resultCode;
  const answered = code === AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_VERIFIED_CODE || code === AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_PRESENT_CODE;
  // A check ran nothing, so it keeps the step as it ran (see the header): another action, declared by the answer or named
  // by the value (run `run-mux74k5q-1c3c2127`, C2), another control, or a parameter the step never ran with (run
  // `run-muxkzdjw-31a13429`, C2b) is a different step. Refused, never inferred.
  const otherNode = otherAction(step, value, parsed?.draft?.actionId);
  const otherControl = otherNode === undefined && movesControl(step, value);
  const newKinds = otherNode === undefined && !otherControl ? parametersNotRun(step, value) : [];
  const took = answered && otherNode === undefined && !otherControl && newKinds.length === 0;
  const position = step.position;
  const acts = [...(step.acts ?? [])];
  if (took) {
    if (!step.priorExecution) {
      const { priorExecution: _prior, checkedCandidate: _candidate, ...performed } = step;
      step.priorExecution = { ...structuredClone(performed), lasting: true };
    }
    // The caller's parsed declaration is the same authority normal callRecord
    // uses; it can only name the step's own action here (above), and a tool
    // that is its own action carries no separate tool identity.
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
    delete step.reads;
    delete step.changed;
    delete step.interruption;
    delete step.cancels;
    delete step.routeSignatures;
    delete step.written;
    if (step.replay?.from !== undefined) step.replay = { from: step.replay.from };
    else delete step.replay;
    // The control is the one the step ran on (above), so its resolved form and its
    // words still name it; only the values the argument changed are new.
    const resolved = parsed?.draft?.ranWith;
    if (resolved !== undefined) step.ranWith = resolved;
    else if (step.ranWith !== undefined) step.ranWith = withNewValues(step.ranWith, value);
    if (words) step.words = words;
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
    : !answered
    ? `${why} The check did not find the step able to run with the new argument on the page it started on (${code ?? "no answer"}), so nothing changed: step ${position} keeps the argument it ran with, as after a rerun that did not work.`
    : otherNode !== undefined
    ? `${why} The new argument names ${otherNode}, a different action from the step's ${step.actionId}, and the check ran nothing (${code ?? "no answer"}), so it cannot make step ${position} that action: nothing changed, and step ${position} keeps ${step.actionId} and the argument it ran with. A different action is a different step: run it as a new call with add true.`
    : otherControl
    ? `${why} The new argument names another control than the one step ${position} ran on, and the check ran nothing (${code ?? "no answer"}), so it cannot move step ${position} there: nothing changed, and step ${position} keeps the control and the argument it ran with, and its acts. Another control is another step: run it as a new call with add true and its act. To change only a value of this step, rerun it with just the keys that change.`
    : `${why} The new argument gives ${step.actionId} ${newKinds.map((key) => `"${key}"`).join(", ")}, which step ${position} never ran with, and the check ran nothing (${code ?? "no answer"}), so nothing changed: step ${position} keeps the argument it ran with. A different kind of step is a new call with add true and its act.`;
  return { ran: noted(ran, { checked: true, doneAgain: false, acts, ...(code ? { answer: code } : {}), took, detail }), took };
}

/** The parameter keys that name the control a step acts on. */
const TARGET_KEYS: ReadonlySet<string> = new Set(["target", "selector", "element"]);

/** The keys of a node call's argument that are not its parameters. */
const CALL_KEYS: ReadonlySet<string> = new Set(["node", "parameters", "consequences", "write", AUTOMATION_STUDIO_NODE_REPLAY_KEY, "from"]);

/** The action the answer declares or the value names, when it is not the step's own. */
function otherAction(step: AutomationStudioFlowDraftStep, value: JsonObject, declared: string | undefined): string | undefined {
  const named = declared ?? (typeof value.node === "string" ? value.node : undefined);
  return named !== undefined && named !== step.actionId && named !== step.input.node ? named : undefined;
}

/** Whether the value gives a target parameter a value the step was neither shown with nor ran with. */
function movesControl(step: AutomationStudioFlowDraftStep, value: JsonObject): boolean {
  const ran = ranParameters(step);
  return Object.entries(parametersOf(value) ?? {}).some(([key, given]) =>
    TARGET_KEYS.has(key) && !ran.some((parameters) => Object.hasOwn(parameters, key) && sameJson(parameters[key]!, given)));
}

/** The parameters the value gives that the step never ran with, a target aside. */
function parametersNotRun(step: AutomationStudioFlowDraftStep, value: JsonObject): string[] {
  const ran = ranParameters(step);
  return Object.keys(parametersOf(value) ?? {}).filter((key) => !TARGET_KEYS.has(key) && !ran.some((parameters) => Object.hasOwn(parameters, key)));
}

/** The parameters of what the step was shown with and of what it ran with. */
function ranParameters(step: AutomationStudioFlowDraftStep): JsonObject[] {
  return [parametersOf(step.input), parametersOf(step.ranWith)].filter((parameters): parameters is JsonObject => parameters !== undefined);
}

/** Where an argument keeps its parameters: under `parameters` when it nests them, else its own keys but the call's. */
function parametersOf(argument: JsonValue | undefined): JsonObject | undefined {
  if (!isObject(argument)) return undefined;
  const nested = argument.parameters;
  if (isObject(nested)) return nested;
  return Object.fromEntries(Object.entries(argument).filter(([key]) => !CALL_KEYS.has(key)));
}

/** The resolved form with the value's new parameter values written over the ones it holds, its target left as it ran. */
function withNewValues(ranWith: JsonObject, value: JsonObject): JsonObject {
  const resolved = parametersOf(ranWith);
  if (!resolved) return ranWith;
  const changed = Object.entries(parametersOf(value) ?? {}).filter(([key]) => !TARGET_KEYS.has(key) && Object.hasOwn(resolved, key));
  if (!changed.length) return ranWith;
  const parameters = { ...resolved, ...Object.fromEntries(changed) };
  return isObject(ranWith.parameters) ? { ...ranWith, parameters } : { ...ranWith, ...parameters };
}

function sameJson(left: JsonValue, right: JsonValue): boolean {
  return automationStudioLlmEvidenceCanonicalJson(left) === automationStudioLlmEvidenceCanonicalJson(right);
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
