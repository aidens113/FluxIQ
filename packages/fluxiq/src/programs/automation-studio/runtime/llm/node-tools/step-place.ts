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
// - A step that recorded no `from` is put back to where its node started in
//   the run its draft was seeded from, when that run recorded it (`startedOn`,
//   `./run-start-pages.ts`). This is a step carried from a Flow
//   (`./draft-from-flow.ts`): the build never ran it, so it has no `from` of
//   its own, and live run `run-muqk713g-d08ad3dc` (C6) reran exactly such a
//   read on results page 5, where the refuted run had left the page -- 1 page,
//   11 items, kept 0 -- in every one of its re-author reruns. The step's own
//   `from` wins when it has one: it is where this build saw the step start.
// - A step with neither runs where it is: nothing says where else. Its result
//   says so (`automationStudioNodeRerunPlaceNoted`), because a rerun that read
//   whatever page the last call left is not evidence about the step, and the
//   model that read C6's eleven unfiltered rows had no way to know.
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
// Every rerun that ran says in its result where it ran (`rerunPlace`), so the
// model and anyone reading the run's steps can tell a rerun on its own start
// page from one on the page the last call left; a rerun put back says which
// steps before it were done again. The step the rerun leaves in the draft keeps
// the same account (`automationStudioNodeRerunPlaceOfStep`), so the judge of a
// build's test can tell a landing made after its earlier steps from one that
// was not.
//
// **A seeded step's place is where its node started in the repaired run (t443,
// live run `run-mv4dgmki-2b13db91`, R4b).** A step carried from a Flow has no
// `replay.from`, and the walk back used to compare only that field, so the run
// of steps to do again was always empty in a re-author draft: the rerun of the
// Flow's "Add to basket" put the item page back to its defaults and pressed it
// there -- the wrong variant, quantity 1 -- with every choice the steps before
// it make left undone (`startPage: seeded_run`, no `doneAgain`). So every step's
// place, the rerun's own and each earlier one's, is its `replay.from`, else
// where its node started in the run the draft was seeded from (`seedStartedOn`,
// by the id it stands for).
//
// **A lasting act is pressed only on positive evidence (t443, supervisor
// review).** Comparing two pages' tokens can fail open: the repaired run's
// token and this build's for one page may be spelled apart, and the walk back
// then reads "another page", does nothing again and presses after the reset
// alone -- R4b's wrong item. So a rerun that would do a lasting act not yet
// done (`pressesLastingAct`: its step is one the test checks, or its argument
// declares a lasting consequence) compares nothing. It puts the target back
// where the Flow's first proposed step starts and does every proposed step
// before it again, in order, the way a test does (a lasting one is checked,
// not repeated), and it is pressed only when each of them replayed or is a step
// the Flow itself does not always run. Any other case -- no known start, a
// failed reset, a step not done again -- presses nothing: it is answered
// `rerun_place_unreachable` with `lastingAct: true`, naming that step. A lasting
// act is pressed at most once in a build, and pressed out of order it leaves the
// wrong thing done for good. Every other rerun keeps the walk back above.
//
// **The failure that added the last rule (t193 lane B, `run-muqiojz4-04a7a8fc`,
// bigbox cart).** Draft step 9 pressed "+" on the towel page and step 10 pressed
// Add to cart there. The rerun of step 10 reset the target to the towel page's
// address, which brought the page back at quantity 1 (steps 0059-0061, a toast
// reading "Qty 1"); the model then "fixed" the quantity by rerunning step 10 as
// "+" (steps 0063-0065), and the Flow lost its Add to cart.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import {
  automationStudioFlowDraftConditionalStepReasons,
  automationStudioFlowDraftDeclaresLasting,
  automationStudioFlowDraftExemptStepIds,
  automationStudioFlowDraftDryRunVerdict,
  automationStudioFlowDraftReplayOutcomeWord,
  automationStudioFlowDraftSometimesPresentStepIds,
  automationStudioFlowDraftStepActDone,
  automationStudioFlowDraftStepId,
  automationStudioFlowDraftStepIsProposed,
  automationStudioFlowDraftStepReplayMode,
  type AutomationStudioFlowDraftReplayOutcome,
  type AutomationStudioFlowDraftStep,
  type AutomationStudioFlowDraftStepWords
} from "../../flow-draft/index.ts";
import { automationStudioFlowDraftStepCarriedJoin } from "../../flow-draft/carried-step/index.ts";
import { automationStudioLlmEvidenceParseToolExecutionResult } from "../evidence-loop-decision.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../evidence-loop.ts";
import { automationStudioFlowDraftReplaySteps } from "./replay-draft.ts";
import type { AutomationStudioFlowDraftReplayDefinitionOf, AutomationStudioFlowDraftReplayNodeOf } from "./replay-span.ts";
import { AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES, automationStudioNodeReplayResetCall, automationStudioNodeReplayToolId } from "./replay.ts";

/** The result code of a rerun that ran nothing, because its step's place could not be put back. */
export const AUTOMATION_STUDIO_NODE_RERUN_PLACE_UNREACHABLE_CODE = "llm_evidence_loop.rerun_place_unreachable";

/** One step done again after the reset and before the rerun: which step, under which call, and the word its outcome reads under. */
export type AutomationStudioNodeRerunDoneAgain = { step: number; stepId?: string; actionId: string; callId: string; outcome: string };

/**
 * Where a rerun runs: as the target stands, after it was put back, or nowhere.
 *
 * `in_place` says why: the target was `already_there`, or no start page was
 * known (`start_page_unknown`) and it ran wherever the last call left it.
 * `put_back` says whose start page it went back to: the `step`'s own, the
 * one its node started on in the run the draft was seeded from (`seeded_run`),
 * or, for a lasting act, where the Flow's first step starts (`flow_start`);
 * `doneAgain` is the steps done again after the reset, in order, empty when
 * none before it started on its place; `unknownBefore` is the position of the
 * proposed step the walk back stopped at because nothing recorded where it
 * started, so whether it built on this page is not known.
 */
export type AutomationStudioNodeRerunPlace =
  | { kind: "in_place"; why: "already_there" | "start_page_unknown" }
  | { kind: "put_back"; callId: string; startPage: "step" | "seeded_run" | "flow_start"; doneAgain: AutomationStudioNodeRerunDoneAgain[]; unknownBefore?: number }
  /** `result` is what the rerun is answered with, in place of running it. */
  | { kind: "unreachable"; callId: string; result: AutomationStudioLlmEvidenceToolExecutionResult };

/** Puts the target back where `step` found it, with what the steps before it built there, when it is not there already. */
export async function automationStudioNodeRerunFromItsPlace(input: {
  step: AutomationStudioFlowDraftStep;
  /**
   * Where each seeded step's node started in the run its draft was seeded
   * from, by step id (`./draft-from-flow.ts`, `startedOnByStepId`). A step's
   * entry -- by the id it stands for, else its own -- is its place only when
   * it recorded no `replay.from` of its own; that holds for the rerun's step
   * and for every step before it (see the header).
   */
  seedStartedOn?: Readonly<Record<string, JsonObject>> | undefined;
  /** The draft `step` is in: the proposed steps before it that started on its place are done again. */
  steps: readonly AutomationStudioFlowDraftStep[];
  /** The state the loop last saw the target in, when it saw one. */
  now: string | undefined;
  /** The rerun's own call id; the reset is sent as `<callId>.place`, each step done again as `<callId>.place.<position>`. */
  callId: string;
  /** The rerun's own argument: one that declares a lasting consequence makes it a lasting act's rerun (see the header). */
  value?: JsonObject | undefined;
  executeTool(request: { callId: string; toolId: string; value: JsonObject; signal?: AbortSignal }): Promise<JsonValue | AutomationStudioLlmEvidenceToolExecutionResult>;
  /** The build's lasting acts, as the dry run is given them (`./replay-draft.ts`): a step done again that claims one is checked, not repeated. */
  lastingActs?: ReadonlySet<string> | undefined;
  /**
   * The nodes the steps name, as the dry run is given them: a seeded step is
   * done again as its saved Flow runs it, which needs its node (`./replay-span.ts`,
   * `automationStudioFlowDraftReplayPassCall`; t443).
   */
  nodeOf?: AutomationStudioFlowDraftReplayNodeOf | undefined;
  definitionOf?: AutomationStudioFlowDraftReplayDefinitionOf | undefined;
  signal?: AbortSignal | undefined;
}): Promise<AutomationStudioNodeRerunPlace> {
  const placeOf = (step: AutomationStudioFlowDraftStep): JsonObject | undefined =>
    step.replay?.from ?? input.seedStartedOn?.[step.standsFor ?? automationStudioFlowDraftStepId(step)];
  const callId = `${input.callId}.place`;
  // A lasting act not yet done is pressed only on positive evidence: every step before it done again, in order (see the header).
  if (pressesLastingAct(input)) return lastingActPlace(input, placeOf, callId);
  const own = input.step.replay?.from;
  const from = placeOf(input.step);
  if (!from) return { kind: "in_place", why: "start_page_unknown" };
  if (input.now !== undefined && input.now === input.step.stateBefore) return { kind: "in_place", why: "already_there" };
  const { run, unknownBefore } = stepsBefore(input.steps, input.step, from, placeOf);
  const refused = await putBack(input, from, callId);
  if (refused) return refused;
  const startPage = own ? "step" : "seeded_run";
  const unknown = unknownBefore === undefined ? {} : { unknownBefore };
  if (!run.length) return { kind: "put_back", callId, startPage, doneAgain: [], ...unknown };
  const { done, doneAgain } = await redo(input, run, callId);
  const failed = firstBlocking(input.steps, done.outcomes);
  if (!failed) return { kind: "put_back", callId, startPage, doneAgain, ...unknown };
  return notDoneAgain(callId, `step ${failed.step} before it, which started on the same page, could not be done again`, done, doneAgain, failed);
}

/** What a rerun is given, as `automationStudioNodeRerunFromItsPlace` takes it. */
type RerunPlaceInput = Parameters<typeof automationStudioNodeRerunFromItsPlace>[0];

/**
 * Whether the rerun would do a lasting act that is not done yet: its step is
 * one the test would check (`../../flow-draft/verify-only.ts`), or the rerun's
 * own argument declares a lasting consequence, and the act has not landed.
 * A done act is rerun as a check (`./rerun-check.ts`), which presses nothing.
 */
function pressesLastingAct(input: RerunPlaceInput): boolean {
  if (automationStudioFlowDraftStepActDone(input.step, input.lastingActs)) return false;
  return automationStudioFlowDraftStepReplayMode(input.step, input.lastingActs) === "verify" || automationStudioFlowDraftDeclaresLasting(input.value?.consequences);
}

/**
 * Where a rerun that does a lasting act runs: only after every proposed step
 * before it was done again, in order, from where the first of them starts --
 * never on the strength of comparing two pages' tokens, which can fail open
 * (two spellings of one page read as two pages, and the act is pressed after a
 * reset alone, as in R4b). Each step done again must have replayed (a lasting
 * one is checked: verified or present), or be one the Flow itself does not
 * always run (`../../flow-draft/routing.ts`). Anything else -- no known start
 * for the first step, a reset that failed, a step not done again -- presses
 * nothing and is answered `rerun_place_unreachable` with `lastingAct: true`.
 */
async function lastingActPlace(input: RerunPlaceInput, placeOf: (step: AutomationStudioFlowDraftStep) => JsonObject | undefined, callId: string): Promise<AutomationStudioNodeRerunPlace> {
  const run = proposedBefore(input.steps, input.step).filter((step) => !automationStudioFlowDraftStepCarriedJoin(step));
  const first = run[0] ?? input.step;
  const from = placeOf(first);
  if (!from) return unreachable(callId, lastingWithout(first.position, first === input.step), { lastingAct: true, unknownBefore: first.position });
  const refused = await putBack(input, from, callId);
  if (refused) return lasting(refused);
  if (!run.length) return { kind: "put_back", callId, startPage: "flow_start", doneAgain: [] };
  const { done, doneAgain } = await redo(input, run, callId);
  const conditional = automationStudioFlowDraftConditionalStepReasons(input.steps);
  const answered = new Map(done.outcomes.map((outcome) => [outcome.stepId, outcome]));
  for (const step of run) {
    const id = automationStudioFlowDraftStepId(step);
    const outcome = answered.get(id);
    if (outcome?.status === "replayed" || (outcome && conditional.has(id))) continue;
    const why = `step ${step.position} before it was not done again, and this step's act lasts: it is done once, and only after every step before it`;
    const missing = { doneAgain, failedStep: { step: step.position, actionId: step.actionId, outcome: "not_run" } };
    return lasting(outcome ? notDoneAgain(callId, why, done, doneAgain, outcome) : unreachable(callId, why, missing));
  }
  return { kind: "put_back", callId, startPage: "flow_start", doneAgain };
}

/** The reset to `from`, sent as `callId`; nothing when it put the target back, else the rerun's refusal. */
async function putBack(input: RerunPlaceInput, from: JsonObject, callId: string): Promise<AutomationStudioNodeRerunPlace | undefined> {
  let answered: ReturnType<typeof automationStudioLlmEvidenceParseToolExecutionResult>;
  try {
    const ran = await input.executeTool({ callId, toolId: automationStudioNodeReplayToolId(input.step), value: automationStudioNodeReplayResetCall(from), ...(input.signal ? { signal: input.signal } : {}) });
    answered = automationStudioLlmEvidenceParseToolExecutionResult(ran, "mutate");
  } catch (error) {
    if (input.signal?.aborted) throw error;
    answered = undefined;
  }
  if (answered?.resultCode === AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES.replayed && answered.effectApplied === true) return undefined;
  return unreachable(callId, "that page could not be put back", answered ? { putBack: answered.evidence } : {});
}

/** Does `run` again the way a replay does, under `<callId>.<position>`, and names each step done again. */
async function redo(input: RerunPlaceInput, run: readonly AutomationStudioFlowDraftStep[], callId: string) {
  const done = await automationStudioFlowDraftReplaySteps({
    executeTool: input.executeTool,
    ...(input.signal ? { signal: input.signal } : {}),
    steps: input.steps,
    run,
    callIdOf: (step) => `${callId}.${step.position}`,
    ...(input.lastingActs ? { lastingActs: input.lastingActs } : {}),
    ...(input.nodeOf ? { nodeOf: input.nodeOf } : {}),
    ...(input.definitionOf ? { definitionOf: input.definitionOf } : {}),
    // Every step of the run follows the one before it from the place the reset
    // put back, so asking one again "on its own page" would reset away the others.
    reanchor: false
  });
  const doneAgain = done.outcomes.map((outcome): AutomationStudioNodeRerunDoneAgain => ({
    step: outcome.step,
    ...(outcome.stepId === undefined ? {} : { stepId: outcome.stepId }),
    actionId: outcome.actionId,
    callId: `${callId}.${outcome.step}`,
    outcome: automationStudioFlowDraftReplayOutcomeWord(outcome)
  }));
  return { done, doneAgain };
}

/** The refusal of a rerun whose step `failed` before it was not done again. */
function notDoneAgain(callId: string, why: string, done: Awaited<ReturnType<typeof redo>>["done"], doneAgain: AutomationStudioNodeRerunDoneAgain[], failed: AutomationStudioFlowDraftReplayOutcome): AutomationStudioNodeRerunPlace {
  const seen = done.observations.find((observation) => observation.step === failed.step);
  return unreachable(callId, why, {
    doneAgain,
    failedStep: { step: failed.step, actionId: failed.actionId, outcome: automationStudioFlowDraftReplayOutcomeWord(failed), ...(seen ? { evidence: seen.evidence } : {}) }
  });
}

/** A refusal marked as one of a lasting act's rerun. */
function lasting(place: AutomationStudioNodeRerunPlace): AutomationStudioNodeRerunPlace {
  if (place.kind !== "unreachable" || !isObject(place.result.evidence)) return place;
  return { ...place, result: { ...place.result, evidence: { ...place.result.evidence, lastingAct: true } } };
}

/**
 * The proposed steps just before `step` that started where it did: walking back
 * from it over the proposed steps while each one's place (`placeOf`: its own
 * `from`, else where its node started in the seeded run) is `from`. Both places
 * are the caller's and are compared whole, never read. `unknownBefore` is the
 * position of the step the walk stopped at for having no place at all.
 */
function stepsBefore(
  steps: readonly AutomationStudioFlowDraftStep[],
  step: AutomationStudioFlowDraftStep,
  from: JsonObject,
  placeOf: (step: AutomationStudioFlowDraftStep) => JsonObject | undefined
): { run: AutomationStudioFlowDraftStep[]; unknownBefore?: number } {
  const place = JSON.stringify(from);
  const run: AutomationStudioFlowDraftStep[] = [];
  for (const each of proposedBefore(steps, step).reverse()) {
    const theirs = placeOf(each);
    if (theirs === undefined) return { run, unknownBefore: each.position };
    if (JSON.stringify(theirs) !== place) break;
    run.unshift(each);
  }
  return { run };
}

/** The proposed steps before `step` in the draft, in order. */
function proposedBefore(steps: readonly AutomationStudioFlowDraftStep[], step: AutomationStudioFlowDraftStep): AutomationStudioFlowDraftStep[] {
  const at = steps.indexOf(step);
  return (at >= 0 ? steps.slice(0, at) : steps.filter((each) => each.position < step.position)).filter(automationStudioFlowDraftStepIsProposed);
}

/** Why a lasting act was not pressed: nothing says where the Flow's steps before it start, or, with none before it, where it does. */
function lastingWithout(position: number, itself: boolean): string {
  return itself
    ? "nothing recorded the page this step started on, and this step's act lasts: it is done once, and only from where it starts"
    : `nothing recorded the page step ${position} started on, so the steps before this one cannot be done again from there first, and this step's act lasts: it is done once, and only after every step before it`;
}

/**
 * What the step a rerun leaves in the draft keeps of where the rerun ran
 * (`AutomationStudioFlowDraftStep.rerunPlace`): nothing for a place that ran
 * nothing.
 */
export function automationStudioNodeRerunPlaceOfStep(place: AutomationStudioNodeRerunPlace | undefined): AutomationStudioFlowDraftStep["rerunPlace"] {
  if (!place || place.kind === "unreachable") return undefined;
  if (place.kind === "in_place") return { kind: place.why };
  return {
    kind: "put_back",
    redone: place.doneAgain.flatMap((again) => (again.stepId === undefined ? [] : [again.stepId])),
    ...(place.unknownBefore === undefined ? {} : { unknownBefore: place.unknownBefore })
  };
}

/**
 * The first step done again that did not replay and that the test from the
 * start would not pass over either: not one the Flow would not always run, not
 * one whose run a checked step withheld, and not one the replay proves is only
 * sometimes there -- the three `./dry-run-gate.ts` passes over. The draft is
 * not rewritten here: a step the gate would make optional is only passed.
 */
function firstBlocking(steps: readonly AutomationStudioFlowDraftStep[], outcomes: readonly AutomationStudioFlowDraftReplayOutcome[]): AutomationStudioFlowDraftReplayOutcome | undefined {
  const excused = automationStudioFlowDraftExemptStepIds(steps, outcomes);
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

/** The key a rerun's result carries its place under. */
const RERUN_PLACE_KEY = "rerunPlace";

/** What a rerun that ran where the page was is told, in words a model acts on. */
const IN_PLACE_DETAIL = "This rerun ran where the page is now, not where its step started: nothing recorded the page the step started on, so the page was not put back. If an earlier call moved the page (another results page, a scroll, a filter), this answer is about that page and not the step's own.";

/**
 * The step a rerun replaces, for the note on a refused rerun: its position, and
 * what its new argument named in the domain's words, asked before the page was
 * put back (`../../flow-draft/step-words.ts`).
 */
export type AutomationStudioNodeRerunNamed = { step: number; words?: AutomationStudioFlowDraftStepWords | undefined };

/**
 * The rerun's result, saying where it ran.
 *
 * Written into the result's evidence object under `rerunPlace`, so the model
 * reads it beside the answer it qualifies and the run's step record keeps it.
 * A result whose evidence is not an object is left as it is rather than
 * reshaped, and so is a place that ran nothing: its own answer already says so.
 *
 * **A rerun refused after its page was put back** (live run
 * `run-musq0b1m-0472cfa0`, Cause 4) says so in words: putting a page back loads
 * it again, so what the model read on the page before -- a control's name, for
 * the web a handle -- is resolved against the page as it loaded, and the answer
 * is about that page. `named` is the control the argument meant, in the
 * domain's words from before the reset, so the model can find it on the page
 * the answer shows. A refusal is the answer's own `ok: false`, read as the loop
 * reads it; nothing else in the answer is read.
 */
export function automationStudioNodeRerunPlaceNoted(
  place: AutomationStudioNodeRerunPlace | undefined,
  ran: JsonValue | AutomationStudioLlmEvidenceToolExecutionResult,
  replaces?: AutomationStudioNodeRerunNamed | undefined
): JsonValue | AutomationStudioLlmEvidenceToolExecutionResult {
  if (!isObject(ran)) return ran;
  if (ran.kind !== "llm_evidence_tool_execution") {
    const note = placeNote(place, (ran as JsonObject).ok === false ? replaces : undefined);
    return note ? { ...ran, [RERUN_PLACE_KEY]: note } : ran;
  }
  const execution = ran as AutomationStudioLlmEvidenceToolExecutionResult;
  if (!isObject(execution.evidence)) return ran;
  const note = placeNote(place, execution.evidence.ok === false ? replaces : undefined);
  return note ? { ...execution, evidence: { ...execution.evidence, [RERUN_PLACE_KEY]: note } } : ran;
}

/** `refused` is given only when the rerun's answer refused it. */
function placeNote(place: AutomationStudioNodeRerunPlace | undefined, refused?: AutomationStudioNodeRerunNamed): JsonObject | undefined {
  if (!place) return undefined;
  // The steps done again say the rerun ran after them (t193's open item: the
  // model was not told which steps a rerun redid).
  if (place.kind === "put_back") {
    return {
      place: "put_back",
      startPage: place.startPage,
      ...(place.doneAgain.length ? { doneAgain: place.doneAgain.map(({ step, actionId, outcome }) => ({ step, actionId, outcome })) } : {}),
      ...(place.unknownBefore === undefined ? {} : { notDoneAgain: `Nothing recorded the page step ${place.unknownBefore} started on, so step ${place.unknownBefore} and the steps before it were not done again: this rerun ran without what they do on this page.` }),
      ...(refused ? putBackRefused(refused) : {})
    };
  }
  if (place.kind === "unreachable") return undefined;
  return place.why === "already_there"
    ? { place: "in_place", reason: "already_on_start_page" }
    : { place: "in_place", reason: "start_page_unknown", detail: IN_PLACE_DETAIL };
}

/** What a rerun refused on a page put back is told: the page was loaded again first, and which control its argument meant. */
function putBackRefused(refused: AutomationStudioNodeRerunNamed): JsonObject {
  const target = refused.words?.target?.trim();
  const meant = target
    ? `Your argument named "${target}" on the page you read before; find that control and name it as the page in this answer shows it, then rerun.`
    : "Find the control your argument meant and name it as the page in this answer shows it, then rerun.";
  return {
    ...(target ? { named: target } : {}),
    detail: `The page was put back where step ${refused.step} started before this rerun ran, which loads it again, so the rerun was asked on the page as it loaded and this answer is about that page. A name read on the page before it was put back may name nothing on it now, or another control. ${meant}`
  };
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
