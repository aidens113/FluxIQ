// Running the whole draft again, once, with nothing attached to it.
//
// The reset, then every step the draft proposes, in order, each through the
// same executor an ordinary tool call goes through -- so each one passes the
// same permission gate, and none of them reaches a provider. A step whose
// effect lasts -- by its declaration, or by claiming an act the instruction
// asks to last (`lastingActs`, t174-w89) -- is checked rather than run again,
// and the steps after it are still run (`../../flow-draft/verify-only.ts`). The loop keeps its
// own bookkeeping out of here: this makes the calls and reports what came back,
// and `evidence-loop.ts` decides what the verdict does to the build.
//
// **One step may be asked twice.** A step whose target is missing on another
// page, right after a step this replay did not do again, is asked once more on
// its own page: the same reset the replay starts with, sent with that step's
// own `replay.from`, then the step again (`../../flow-draft/site-memory.ts`).
// Never more than once per step, and never for a step already excused or one
// the Flow would not always run, which do not block either way.
//
// **Nothing here is counted as a tool call.** The loop's `maxToolCalls` and
// `minToolCalls` bound what the *model* asked for, and a replay is what Core
// asked for. Counting these would end long builds early and would make a
// refused dry run cost the model the calls it needs to fix it.
//
// **A step the Flow passes over says so (t193 1002-M, C6 and C10).** One that
// did not replay and does not stand in the way -- the draft says the Flow does
// not always run it, or it needed a withheld effect -- carries `excused` on its
// outcome, naming why (`../../flow-draft/excused.ts`), and its call carries
// `excusable` before it is sent, so the activity row that ends with it can say
// it was skipped (`../../activity/observer.ts` takes it off the call; no host
// sees it). Live run `run-murzln6g-11debe1d` showed one such step to the judge
// as `failed` and in the chat as "Didn't work".
//
// **A carried Merge is passed through (t274-c4).** A re-authored Flow's seed
// keeps the Merge its optional step joins at as a step
// (`./draft-from-flow.ts`), and that step acts on nothing, has no output to run
// and no start page, so nothing can be sent for it. It used to fail here as "a
// step with nothing to run it with", and live run `run-muw60j7c-bb7c9a62`'s
// re-author was told to rerun it. It is skipped, with no call and no outcome:
// the steps on either side of it are what the test runs
// (`../../flow-draft/carried-step/`).
//
// **A step that comes back unreadable is a failed step**, never a skipped one.
// A host that does not implement the replay answers something this cannot read,
// and the honest reading of that is "this step was not demonstrably run again",
// which refuses the proposal rather than waving it through.
//
// **A repeat runs as a loop (t252).** A span whose list step returned its rows
// in this test is run once per row, each member with that row and its bindings
// resolved for it, a span over a check runs while the check replays, and a
// do-while runs pass by pass until its last step ends it -- planned from its
// routing, with or without a node lookup (`./replay-span.ts`). A step outside a
// repeat has its bindings resolved too, so an input takes its test value; a
// binding nothing answers fails the step `core.replay.unresolved_binding`, and
// nothing is sent for it.
//
// **A check before a span is excused when it does not hold (read-list design
// 4.2(e)).** A repeat over a check -- the step right before the span, whose
// node declares no array output -- runs the span zero times in the Flow when
// the check's first ask does not hold, so that check failing is the loop not
// running, not the Flow failing. It is excused `check`, on its call and its
// outcome, and the verdict passes over it; a part run does not stop at it.
// Decided here, because only the node definitions say a step is a check and
// not a list (`../../flow-draft/routing.ts` knows none); a list a span walks
// is never excused for this.
//
// **An earlier step's output is what that step answered in this walk (P5,
// t270).** Each step's real outputs are kept as the walk goes -- only from a
// step asked to run that ran (`automationStudioFlowDraftReplayProduced`) -- and a
// later step's `$step` binding resolves against them. Never the build's
// exploration, a stored `produced`, or another test: a step that was checked,
// failed, or has not run yet in this walk produced nothing, and the step
// reading it fails `core.replay.unresolved_binding`. A part run that starts
// after the step it reads therefore cannot send it either.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import {
  automationStudioFlowDraftExemptStepIds,
  automationStudioFlowDraftConditionalStepReasons,
  automationStudioFlowDraftDryRunVerdict,
  automationStudioFlowDraftPrecedingProposedStep,
  automationStudioFlowDraftRepeatIsWhile,
  automationStudioFlowDraftReplayFrom,
  automationStudioFlowDraftReplayOutcomeVerified,
  automationStudioFlowDraftReplayOutcomeWord,
  automationStudioFlowDraftStepId,
  automationStudioFlowDraftStepIsProposed,
  automationStudioFlowDraftStepOutputsState,
  automationStudioFlowDraftStepReplayMode,
  automationStudioFlowDraftStepWithholdsLater,
  type AutomationStudioFlowDraftDryRun,
  type AutomationStudioFlowDraftExcusedReason,
  type AutomationStudioFlowDraftReplayMode,
  type AutomationStudioFlowDraftReplayOutcome,
  type AutomationStudioFlowDraftStep
} from "../../flow-draft/index.ts";
import { automationStudioFlowDraftStepCarriedJoin } from "../../flow-draft/carried-step/index.ts";
import { automationStudioLlmEvidenceParseToolExecutionResult } from "../evidence-loop-decision.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../evidence-loop.ts";
import {
  AUTOMATION_STUDIO_NODE_REPLAY_KEY,
  AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES,
  automationStudioNodeReplayResetCall,
  automationStudioNodeReplayStatus,
  automationStudioNodeReplayToolId
} from "./replay.ts";
import {
  AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_UNRESOLVED_BINDING_CODE,
  automationStudioFlowDraftReplayPassCall,
  automationStudioFlowDraftReplayProduced,
  automationStudioFlowDraftReplaySpanPlan,
  automationStudioFlowDraftReplaySpanRun,
  automationStudioFlowDraftReplayStoredRecords,
  type AutomationStudioFlowDraftReplayAnswer,
  type AutomationStudioFlowDraftReplayDefinitionOf,
  type AutomationStudioFlowDraftReplayNodeOf,
  type AutomationStudioFlowDraftReplayObservation
} from "./replay-span.ts";

/** What the caller has to lend a replay: the executor. */
export type AutomationStudioFlowDraftReplayInput = {
  steps: readonly AutomationStudioFlowDraftStep[];
  /** 1 for the first replay of this build. */
  attempt: number;
  /**
   * `excusable`, on a step's call, is why the test passes over that step if it
   * does not hold (see the header): read by the activity observer, which takes
   * it off before the call goes on. An executor that is not observed ignores it.
   */
  executeTool(input: { callId: string; toolId: string; value: JsonObject; signal?: AbortSignal; excusable?: AutomationStudioFlowDraftExcusedReason }): Promise<JsonValue | AutomationStudioLlmEvidenceToolExecutionResult>;
  /**
   * The ids of the instruction's acts this build reads as lasting
   * (`../../flow-bootstrap/action-permissions.ts`, `instructedLastingActs`): a
   * step claiming one is checked rather than run again, whatever it declared
   * (`../../flow-draft/verify-only.ts`). Absent, a step lasts by its
   * declaration alone.
   */
  lastingActs?: ReadonlySet<string> | undefined;
  /**
   * The node each step names, by its `actionId`: what says whether a repeat
   * walks a list's rows or repeats while a check holds, and which of its steps
   * take the row (`./replay-span.ts`). Absent, a repeat is sent once and
   * excused, as before t252.
   */
  nodeOf?: AutomationStudioFlowDraftReplayNodeOf | undefined;
  /**
   * The full definition of the node each step names, by its `actionId`: with
   * it a read's call carries the record output assembly writes on its node, as
   * the stored Flow's read does (`./replay-span.ts`, read-list S1). Absent, a
   * call carries what the step ran with.
   */
  definitionOf?: AutomationStudioFlowDraftReplayDefinitionOf | undefined;
  signal?: AbortSignal;
};

/** A replay, and the one piece of evidence worth showing the model afterwards. */
export type AutomationStudioFlowDraftReplayResult = {
  verdict: AutomationStudioFlowDraftDryRun;
  /**
   * What the first step that did not replay left behind, when it left anything.
   *
   * One, not all of them: the first failure is what has to be understood, the
   * rest are usually its consequences. This is the page as it was *when the
   * replay broke*, which is what a correction needs.
   */
  evidence?: { callId: string; toolId: string; value: JsonValue };
  /**
   * What each step's replay answered, one entry per step whose answer could be
   * read, in the order they ran; the reset is not a step and is not here.
   *
   * The verdict keeps only a status word per step, and a judge of what the
   * build actually did needs what the test saw: the rows a read returned, the
   * page a press left. A re-anchored step reports its second answer, the one
   * its outcome is read from. Structurally `AutomationStudioFlowDraftTestObservation`
   * (`./dry-run-gate.ts`), declared here so the replay does not import its gate.
   * A pass of a repeat says which pass, of how many (`./replay-span.ts`).
   */
  observations: AutomationStudioFlowDraftReplayObservation[];
};

/**
 * What a replay call answers once a person has cleared a check it met.
 *
 * A check is not the step failing to run again: the domain describes the step
 * as it stands once the check is cleared, and the build hands the check to the
 * person (`../../flow-bootstrap/person-needed.ts`). Read the way the replay reads
 * everything else, a cleared step would carry no code and count as `failed`,
 * and the model would be asked to amend a Flow with nothing wrong in it. So a
 * step answers `replayed`; a reset answers nothing, because the replay reads a
 * reset from `effectApplied`, which the domain's own statement already carries.
 * A check a person cleared answers `verified`: it was still not run.
 */
export function automationStudioFlowDraftReplayClearedCode(value: JsonObject): string | undefined {
  const kind = value[AUTOMATION_STUDIO_NODE_REPLAY_KEY];
  if (kind === "step") return AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES.replayed;
  return kind === "verify" ? AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES.verified : undefined;
}

/** Run the draft again, from the state its first step found. */
export async function replayAutomationStudioFlowDraft(input: AutomationStudioFlowDraftReplayInput): Promise<AutomationStudioFlowDraftReplayResult> {
  const proposed = input.steps.filter(automationStudioFlowDraftStepIsProposed);
  // A carried join is never sent (see the header), so the reset is the first step's that is.
  const sent = proposed.filter((step) => !automationStudioFlowDraftStepCarriedJoin(step));
  const from = automationStudioFlowDraftReplayFrom(sent);
  const outcomes: AutomationStudioFlowDraftReplayOutcome[] = [];
  const observations: AutomationStudioFlowDraftReplayResult["observations"] = [];
  const first = sent[0];
  if (!from || !first) return { verdict: verdictOf(input, "failed", outcomes), observations };
  const resetCallId = `dryrun.${input.attempt}.reset`;
  const reset = await call(input, resetCallId, automationStudioNodeReplayToolId(first), automationStudioNodeReplayResetCall(from));
  if (!reset.readable || reset.result.resultCode === AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES.resetFailed || reset.result.effectApplied !== true) {
    return {
      verdict: verdictOf(input, "failed", outcomes),
      observations,
      ...(reset.readable ? { evidence: { callId: resetCallId, toolId: automationStudioNodeReplayToolId(first), value: reset.result.evidence } } : {})
    };
  }
  const done = await automationStudioFlowDraftReplaySteps({
    executeTool: input.executeTool,
    ...(input.signal ? { signal: input.signal } : {}),
    steps: input.steps,
    run: proposed,
    callIdOf: (step) => `dryrun.${input.attempt}.${step.position}`,
    reanchor: true,
    ...(input.lastingActs ? { lastingActs: input.lastingActs } : {}),
    ...(input.nodeOf ? { nodeOf: input.nodeOf } : {}),
    ...(input.definitionOf ? { definitionOf: input.definitionOf } : {})
  });
  return { verdict: verdictOf(input, "ok", done.outcomes), observations: done.observations, ...(done.evidence ? { evidence: done.evidence } : {}) };
}

/** What a run of steps done again needs: the executor, the draft, and the steps. */
export type AutomationStudioFlowDraftReplayStepsInput = Pick<AutomationStudioFlowDraftReplayInput, "executeTool" | "signal" | "lastingActs" | "nodeOf" | "definitionOf"> & {
  /** The whole draft: what says which steps the Flow would not always run. */
  steps: readonly AutomationStudioFlowDraftStep[];
  /** The proposed steps to do again, in order, from where the target now stands. */
  run: readonly AutomationStudioFlowDraftStep[];
  /** The call id each step is sent under; a pass of a repeat is sent under `<it>.pass.<n>`. */
  callIdOf(step: AutomationStudioFlowDraftStep): string;
  /** Whether a step missing right after one left undone is asked once more on its own page (see the header). */
  reanchor: boolean;
  /**
   * Whether a step that did not pass ends the run there (a part run,
   * `./run-flow-part.ts`); `excused` says the Flow does not always run it.
   * Absent, every step is asked even after one that did not replay.
   */
  stopsAt?: ((step: AutomationStudioFlowDraftStep, excused: boolean) => boolean) | undefined;
  /** Every answer a step's call came back with that could be read, in the order they came. */
  answered?: ((step: AutomationStudioFlowDraftStep, result: Extract<AutomationStudioFlowDraftReplayAnswer, { readable: true }>["result"]) => void) | undefined;
};

/** What a run of steps done again answered: one outcome per step, in order, and what the first that did not replay left. */
export type AutomationStudioFlowDraftReplayStepsResult = Pick<AutomationStudioFlowDraftReplayResult, "observations" | "evidence"> & {
  outcomes: AutomationStudioFlowDraftReplayOutcome[];
  /** The step the run stopped at, when `stopsAt` stopped it. */
  stoppedAt?: number;
};

/**
 * Do proposed steps again, in order, from where the target stands now, the way
 * a replay does every step after its reset: a step whose effect lasts is
 * checked and not run, and every step is asked even after one that did not
 * replay. The caller has put the target where the first of them starts and
 * judges the outcomes; this only makes the calls and reads what came back.
 * Used by the replay above and by a rerun's put-back (`./step-place.ts`).
 */
export async function automationStudioFlowDraftReplaySteps(input: AutomationStudioFlowDraftReplayStepsInput): Promise<AutomationStudioFlowDraftReplayStepsResult> {
  const proposed = input.run;
  const outcomes: AutomationStudioFlowDraftReplayOutcome[] = [];
  const observations: AutomationStudioFlowDraftReplayResult["observations"] = [];
  let evidence: AutomationStudioFlowDraftReplayResult["evidence"];
  // The first verified step whose withheld effect a later step may have
  // needed: one that moved the target, or one a person is asked about, which a
  // dry run never performs. A later step that does not replay is marked with
  // it and does not refuse on its own (`../../flow-draft/verify-only.ts`).
  let withheldBy: number | undefined;
  const reasons = automationStudioFlowDraftConditionalStepReasons(input.steps);
  const conditional = new Set(reasons.keys());
  // Steps of a repeat this run ran once per row: no longer excused (`./replay-span.ts`).
  const expanded = new Set<string>();
  const excused = (stepId: string): boolean => conditional.has(stepId) && !expanded.has(stepId);
  // The checks a repeat runs while, excused `check` when their first ask does not hold (see the header).
  const checks = whileCheckIds(input.steps, input.nodeOf);
  // What each step was asked and answered, for a repeat over it.
  const asked = new Map<AutomationStudioFlowDraftStep, { answer: ReplayAnswer; mode: AutomationStudioFlowDraftReplayMode }>();
  // What each step really produced in this walk, by its id, for a later step's `$step` binding (see the header).
  const produced = new Map<string, JsonObject>();
  const send = async (callId: string, step: AutomationStudioFlowDraftStep, value: JsonObject, excusable?: AutomationStudioFlowDraftExcusedReason): Promise<ReplayAnswer> => {
    const answer = await call(input, callId, automationStudioNodeReplayToolId(step), value, excusable);
    if (answer.readable) input.answered?.(step, answer.result);
    return answer;
  };
  let stoppedAt: number | undefined;
  for (let index = 0; index < proposed.length && stoppedAt === undefined; index += 1) {
    const step = proposed[index]!;
    // A carried join is where two ways meet, not a step: nothing is sent and it has no outcome (see the header).
    if (automationStudioFlowDraftStepCarriedJoin(step)) continue;
    // A do-while is planned without a node lookup; a repeat over a list or a check needs one.
    const plan = automationStudioFlowDraftReplaySpanPlan({ steps: input.steps, run: proposed, index, nodeOf: input.nodeOf, asked: (each) => asked.get(each) });
    if (plan) {
      // A pass is never excused as a step the Flow does not always run: only a withheld effect excuses it.
      const passExcusable: AutomationStudioFlowDraftExcusedReason | undefined = withheldBy === undefined ? undefined : "withheld";
      const span = await automationStudioFlowDraftReplaySpanRun({
        plan,
        nodeOf: input.nodeOf,
        definitionOf: input.definitionOf,
        modeOf: (member) => automationStudioFlowDraftStepReplayMode(member, input.lastingActs),
        callIdOf: input.callIdOf,
        send: (callId, member, value) => send(callId, member, value, passExcusable),
        ...(input.stopsAt ? { stops: (member: AutomationStudioFlowDraftStep) => input.stopsAt!(member, false) } : {}),
        withheldBy,
        earlier: automationStudioFlowDraftStepOutputsState(produced)
      });
      for (const member of plan.members) expanded.add(automationStudioFlowDraftStepId(member));
      outcomes.push(...span.outcomes);
      observations.push(...span.observations);
      if (!evidence && span.evidence) evidence = span.evidence;
      if (span.stopped) stoppedAt = span.outcomes.at(-1)?.step;
      index += plan.members.length - 1;
      continue;
    }
    const mode = automationStudioFlowDraftStepReplayMode(step, input.lastingActs);
    const built = automationStudioFlowDraftReplayPassCall(step, mode, undefined, input.nodeOf?.(step.actionId), automationStudioFlowDraftStepOutputsState(produced), input.definitionOf?.(step.actionId));
    const unresolved = built !== undefined && "unresolved" in built;
    const value = built && "value" in built ? built.value : undefined;
    const callId = input.callIdOf(step);
    const toolId = automationStudioNodeReplayToolId(step);
    const stepId = automationStudioFlowDraftStepId(step);
    // Why the test passes over this step if it does not hold, known before it runs.
    const excusable: AutomationStudioFlowDraftExcusedReason | undefined = (excused(stepId) ? reasons.get(stepId) : undefined)
      ?? (checks.has(stepId) ? "check" : undefined)
      ?? (withheldBy !== undefined ? "withheld" : undefined);
    // A step with nothing to run it with is a failed step, not a skipped one.
    let ran: ReplayAnswer = value ? await send(callId, step, value, excusable) : { readable: false };
    let status = statusOf(ran, mode);
    let reanchored = false;
    const previous = outcomes.at(-1);
    if (input.reanchor && value && status === "unreproducible" && withheldBy === undefined && !excused(stepId) && previous && leftUndone(previous, excused)) {
      const again = await reanchor(input, step, callId, toolId, value);
      if (again) {
        ran = again;
        if (ran.readable) input.answered?.(step, ran.result);
        status = statusOf(ran, mode);
        reanchored = true;
      }
    }
    if (value) asked.set(step, { answer: ran, mode });
    const outputs = value ? automationStudioFlowDraftReplayProduced(ran, mode) : undefined;
    if (outputs) produced.set(stepId, outputs);
    else produced.delete(stepId);
    const resultCode = unresolved ? AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_UNRESOLVED_BINDING_CODE : ran.readable ? ran.result.resultCode : undefined;
    const outcome: AutomationStudioFlowDraftReplayOutcome = {
      step: step.position,
      stepId,
      actionId: step.actionId,
      status,
      ...(resultCode ? { resultCode } : {}),
      ...(mode === "verify" ? { mode } : {}),
      ...(status !== "replayed" && withheldBy !== undefined ? { withheldBy } : {}),
      ...(status !== "replayed" && excusable ? { excused: excusable } : {}),
      ...(reanchored ? { reanchored: true as const } : {})
    };
    outcomes.push(outcome);
    if (ran.readable) {
      // The rows a read stored, beside its evidence and never in it (`./replay-span.ts`, the observation's type).
      const records = value ? automationStudioFlowDraftReplayStoredRecords(ran, mode) : undefined;
      observations.push({
        step: step.position,
        stepId,
        ...(ran.result.resultCode ? { resultCode: ran.result.resultCode } : {}),
        evidence: ran.result.evidence,
        ...(records ? { records } : {})
      });
    }
    if (withheldBy === undefined && automationStudioFlowDraftReplayOutcomeVerified(outcome) && automationStudioFlowDraftStepWithholdsLater(step, proposed.slice(index + 1).find((next) => !automationStudioFlowDraftStepCarriedJoin(next)))) {
      withheldBy = step.position;
    }
    if (status === "replayed") continue;
    // The first thing that did not replay is the one worth showing, and the
    // rest of the steps are still run: a verdict that stops at the first
    // failure cannot tell one broken step from a draft that stopped making
    // sense halfway, and the difference is what the model needs.
    if (!evidence && ran.readable) evidence = { callId: reanchored ? `${callId}.again` : callId, toolId, value: ran.result.evidence };
    // A part run is the exception: it stops where the Flow would, and leaves the target there.
    if (input.stopsAt?.(step, excused(stepId) || checks.has(stepId))) stoppedAt = step.position;
  }
  return { outcomes, observations, ...(evidence ? { evidence } : {}), ...(stoppedAt === undefined ? {} : { stoppedAt }) };
}

function verdictOf(
  input: AutomationStudioFlowDraftReplayInput,
  reset: "ok" | "failed",
  outcomes: readonly AutomationStudioFlowDraftReplayOutcome[]
): AutomationStudioFlowDraftDryRun {
  // A step the Flow would not always run answers for itself: the replay is one
  // situation, and a step that exists for another one is not a broken step
  // (`../../flow-draft/routing.ts`). Nor is a step that ran without what a
  // verified step's withheld effect would have made (`../../flow-draft/verify-only.ts`),
  // nor a check a repeat runs while, whose not holding is the loop not running (see the header).
  return automationStudioFlowDraftDryRunVerdict({
    attempt: input.attempt,
    reset,
    outcomes,
    conditional: automationStudioFlowDraftExemptStepIds(input.steps, outcomes)
  });
}

/**
 * The ids of the checks a repeat runs while: the step a repeat's `over` names
 * when it is the proposed step right before the span (where the assembler
 * requires it) and its node is known and declares no array output -- a list's
 * node declares one, and is never in here. None without a node lookup, and
 * none for a do-while, which names no earlier step.
 */
function whileCheckIds(steps: readonly AutomationStudioFlowDraftStep[], nodeOf: AutomationStudioFlowDraftReplayNodeOf | undefined): ReadonlySet<string> {
  const ids = new Set<string>();
  if (!nodeOf) return ids;
  for (const step of steps) {
    const routing = step.routing;
    if (routing?.kind !== "repeat" || automationStudioFlowDraftRepeatIsWhile(routing) || !automationStudioFlowDraftStepIsProposed(step)) continue;
    const check = automationStudioFlowDraftPrecedingProposedStep(steps, step);
    if (!check || automationStudioFlowDraftStepId(check) !== routing.over) continue;
    const node = nodeOf(check.actionId);
    if (node && !node.outputs.some((output) => output.type === "array")) ids.add(routing.over);
  }
  return ids;
}

/** The status one answer names, or `failed` for an answer that could not be read. */
function statusOf(ran: ReplayAnswer, mode: AutomationStudioFlowDraftReplayMode): AutomationStudioFlowDraftReplayOutcome["status"] {
  return ran.readable ? automationStudioNodeReplayStatus(ran.result.resultCode, mode) : "failed";
}

/**
 * Whether this replay passed a step without doing what it did while
 * exploring: checked and not run (verified, present), remembered, excused by a
 * withheld effect, or a step the Flow would not always run that did not run.
 * The step right after such a step may stand on a page its own exploration
 * step never stood on (`../../flow-draft/site-memory.ts`).
 */
function leftUndone(outcome: AutomationStudioFlowDraftReplayOutcome, excused: (stepId: string) => boolean): boolean {
  if (outcome.withheldBy !== undefined) return true;
  if (outcome.status !== "replayed") return outcome.stepId !== undefined && excused(outcome.stepId);
  const word = automationStudioFlowDraftReplayOutcomeWord(outcome);
  return word === "verified" || word === "present" || word === "remembered";
}

/**
 * Ask a step again on its own page: put the target back where this step found
 * it, with the same reset the replay starts with, then send the same call
 * once more, under `<callId>.reanchor` and `<callId>.again`. The second
 * answer, or nothing when the reset did not put the target back -- the step
 * then keeps its first answer, which blocks: a step looked for only on another
 * page is never passed.
 */
async function reanchor(
  input: ReplayCaller,
  step: AutomationStudioFlowDraftStep,
  callId: string,
  toolId: string,
  value: JsonObject
): Promise<ReplayAnswer | undefined> {
  const from = step.replay?.from;
  if (!from) return undefined;
  const back = await call(input, `${callId}.reanchor`, toolId, automationStudioNodeReplayResetCall(from));
  if (!back.readable || back.result.resultCode !== AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES.replayed || back.result.effectApplied !== true) return undefined;
  return await call(input, `${callId}.again`, toolId, value);
}

/** What a replay call needs from its caller: the executor, and the signal that cancels it. */
type ReplayCaller = Pick<AutomationStudioFlowDraftReplayInput, "executeTool" | "signal">;

/**
 * What one replay call answered.
 *
 * `unreadable` is named rather than left as an absent answer, because the two
 * are different findings and a reader of this code has to see which one it is
 * looking at: a call that came back with something this cannot parse, and a
 * call that threw, are both "this step was not demonstrably run again" -- which
 * the verdict reads as a failed step, refusing the proposal. An absent value
 * here would read as "there was nothing to check", which is the opposite.
 */
type ReplayAnswer = AutomationStudioFlowDraftReplayAnswer;

/**
 * One replay call.
 *
 * A throw is not swallowed: the permission gate raising a request throws here,
 * and the run has to stop rather than record a step as having failed to replay.
 * So a cancelled run re-throws, and everything else is an unreadable answer.
 */
async function call(
  input: ReplayCaller,
  callId: string,
  toolId: string,
  value: JsonObject,
  excusable?: AutomationStudioFlowDraftExcusedReason
): Promise<ReplayAnswer> {
  try {
    const ran = await input.executeTool({ callId, toolId, value, ...(input.signal ? { signal: input.signal } : {}), ...(excusable ? { excusable } : {}) });
    const result = automationStudioLlmEvidenceParseToolExecutionResult(ran, "mutate");
    return result ? { readable: true, result } : { readable: false };
  } catch (error) {
    if (input.signal?.aborted) throw error;
    return { readable: false };
  }
}
