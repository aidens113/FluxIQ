import type { AutomationStudioLlmStepLogPageReader } from "../../llm/step-log/index.ts";
// Running the exploration loop at run time, under a budget, with exactly one
// named outcome at the end of it.
//
// **No loop is written here.** `AS/runtime/llm/evidence-loop.ts` already is
// one, it is already domain-neutral, and Phase H gave it a registry and Core's
// own neutral options. This is the
// first caller to drive it at run time, and what it adds is the three things
// that were missing around it: the budget is spent through a ledger, the loop's
// signal is the ledger's, and every path out of here goes through one classifier.
//
// **One exit.** `runAutomationStudioRuntimeExploration` has a single `return`
// of a classified result, and a `finally` that releases the clock. There is no
// branch that returns a bare `undefined`, none that throws past the caller, and
// none that reports an ending in the vocabulary of whatever happened to stop
// it. That is deliberate: a `try` with several exits is exactly how "it ran out
// of budget" and "it found nothing" became the same empty answer three times
// this month.
//
// **The ledger's reason beats the loop's code.** The loop says `cancelled` for
// every abort there is, so if the classifier trusted it, this exploration's
// clock and the whole recovery's would come back as one word. The ledger
// recorded the real reason at the moment it fired, and the classifier reads
// that first.
//
// **No count ends it (t1057).** The loop is handed loop detection's signal
// (`loopSignal`), as the answer-first rounds are, so neither the loop's own
// counts of turns, calls, looks, refusals or unusable replies nor the ledger's
// (which once ended it at twenty-four actions, twenty-four provider calls, the
// third attempt of one action or the second refusal) end anything. A repeat is
// caught by loop detection and the model is asked how to go on
// (`core.loop_decision`); a refusal is shown to the model as the action's
// result; a stated lasting act on one target is still refused from its third
// landing, because that is about safety, not a count. The exploration ends on
// its answer, the purse (`annotation/exploration.ts`), its clock, a request or
// a person's check -- or where the model itself decides it needs a person:
// nobody is asked in the middle of a Flow, so that ends the exploration with
// what it gathered, and the recovery goes on from there.
//
// **A result exists only when evidence was gathered.** `result` is written on
// the `evidence_gathered` branch and nowhere else, so a caller physically
// cannot read a finding out of an exploration that was stopped, refused or
// empty. `evidence_gathered` itself is constructible only from an action that
// returned evidence -- Phase D's rule, applied one layer further out.
//
// **An action the run was not allowed is never a question mid-Flow (t976).** Every action is
// handed the run's permission check. A repair runs inside a Flow's run, and the user's rule
// (2026-11-03, 2026-11-10) is that a dangerous act asks one question only when a Flow or chat starts,
// never in the middle. So the run holds what its caller allowed and what the person already
// answered in the Flow's chat. The gate's asking is closed before exploration: an uncovered act is
// refused without raising a request, a held no stays `declined`, and the model sees that evidence
// and can try another way. The exploration ledger records every refused action, and ends on none.
//
// Until t976 an `ask` put the request to the run's own thread and the exploration waited for the
// answer (2026-09-22 to 2026-11-20); before that, the first request threw the terminal refusal.
//
// **A tool that fails is shown to the model, not the end of the exploration.**
// The loop runs with `toolFailures: "observe"`, as a build does: a call that
// throws is recorded under its own call id with a closed code, the model sees
// that record on its next decision and tries something else; no run of them
// ends it (t1049), the model is steered instead. Before, one thrown tool ended every
// runtime recovery's exploration outright. The two stops this module throws on
// purpose -- a clock the ledger found run out, and a request the gate raised -- are
// not failures to observe: each aborts the loop's signal first (the ledger's
// own, and the gate's, joined), and a failure seen under an aborted signal
// ends the loop as `cancelled`, which `classify` then names precisely.
//
// **A check only a person can complete is never shown to the model.** A domain
// that meets one -- a robot check, in the web domain's words -- marks its call
// `personNeeded`, and a repair model shown that call would try to act on it.
// So every action runs through `../parking/person-needed-tool-calls.ts`, the
// wrapper a build uses: the person-needed question goes to the same `ask` a
// permission question does, raised at stage `recovery`, and the exploration
// waits. On Continue the step stands with a fresh look in place of the check.
// On Stop, nobody answering, no `ask` bound, or more questions than the bound
// allows, the exploration ends `user_intervention_required` with the
// person-needed code as `endedBy`, and the model is asked nothing further.

import { randomUUID } from "node:crypto";
import type { JsonObject, JsonValue } from "../../../core/index.ts";
import { AutomationStudioActionPermissionGate, type AutomationStudioActionPermissionCheck, type AutomationStudioActionPermissionRequest } from "../../action-permission-requests/index.ts";
import { automationStudioActivityAskPort, observeAutomationStudioEvidenceLoop } from "../../automation-activity/index.ts";
import {
  AUTOMATION_STUDIO_PERSON_NEEDED_ISSUE_CODES,
  automationStudioPersonNeededToolCalls,
  type AutomationStudioPermissionAsk,
  type AutomationStudioPersonNeededEnding
} from "../../automation-parking/index.ts";
import {
  runAutomationStudioLlmEvidenceLoop,
  type AutomationStudioHarnessOptionLoopBinding,
  type AutomationStudioLlmEvidenceLoopAccounting,
  type AutomationStudioLlmEvidenceLoopInput,
  type AutomationStudioLlmEvidenceLoopTrace,
  type AutomationStudioLlmEvidenceToolExecutionResult
} from "../../llm/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_SIGNAL_CODES } from "../../llm/repeat-guard/index.ts";
import { automationStudioExplorationLoopSignal } from "./loop-signal.ts";
import {
  AutomationStudioExplorationBudgetLedger,
  type AutomationStudioExplorationBudget
} from "./exploration-budget.ts";
import {
  AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_LOOP_FAILURE,
  AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_STOP_REASON,
  AUTOMATION_STUDIO_EXPLORATION_REFUSALS,
  automationStudioExplorationCompletionOutcome,
  type AutomationStudioExplorationOutcome,
  type AutomationStudioExplorationRefusal,
  type AutomationStudioExplorationStopReason
} from "./exploration-outcome.ts";
import {
  AutomationStudioExplorationStateRecorder,
  type AutomationStudioExplorationStateDigestFailure,
  type AutomationStudioExplorationStateDigestSource,
  type AutomationStudioExplorationStepRecord
} from "./exploration-state/index.ts";
import type { AutomationStudioRecoveryDeadline } from "./recovery-deadline.ts";
import { AUTOMATION_STUDIO_RECOVERY_LOOP_STAGES, type AutomationStudioRecoveryTraceEvent } from "./trace.ts";
import { AutomationStudioExplorationUnusableDecisionError } from "./unusable-decision.ts";

/**
 * How a domain translates its own refusal codes into Core's refusal kinds.
 *
 * Core cannot read `web.action.rejected.target_unsafe`, and must not learn to:
 * the refusal is semantic and the meaning belongs to whoever owns the medium
 * (decision L3). So the domain is handed an opaque string and answers in Core's
 * closed vocabulary, or answers nothing -- and nothing means the action counts
 * as observed. Either way the model is shown the refusal as the action's result
 * and the exploration goes on (t1057): a classified refusal is recorded as one,
 * and is a step that did not happen for a reduction, never an ending.
 */
export type AutomationStudioExplorationRefusalClassifier = (resultCode: string) => AutomationStudioExplorationRefusal | undefined;

export type AutomationStudioRuntimeExplorationInput = {
  /** The tools and the dispatch, from the harness-option registry. */
  loop: AutomationStudioHarnessOptionLoopBinding;
  /** The parameter keys that name the control a step acts on, for a rerun of a step this exploration already did (`../../llm/node-tools/rerun-check.ts`). */
  controlParameterKeys?: ReadonlySet<string> | undefined;
  /** The domain's page reader for the step log's `page.txt` (`../../llm/step-log/page-reader.ts`). */
  stepLogPageText?: AutomationStudioLlmStepLogPageReader | undefined;
  /**
   * One provider decision. Throwing `AutomationStudioExplorationUnusableDecisionError`
   * says the call was spent on an answer that cannot be used, and the runner
   * asks again under the same budget; anything else it throws ends the loop.
   */
  decide: AutomationStudioLlmEvidenceLoopInput["decide"];
  budget: AutomationStudioExplorationBudget;
  /** The whole recovery's clock, when one is running. Binds ahead of the budget's. */
  recoveryDeadline?: AutomationStudioRecoveryDeadline;
  completionSchema?: JsonObject;
  classifyRefusal?: AutomationStudioExplorationRefusalClassifier;
  /**
   * What the state was, asked once before each action and once after it.
   *
   * Core cannot answer it: the digest it already computes is of the evidence a
   * step returned, which is what the step said rather than what the world was.
   * The contract the answer must satisfy is stated in
   * `exploration-state/digest-source.ts`, and it is the contract a reduction
   * rests on. Absent, the exploration still records what each action was asked
   * to do, and nothing can be reduced.
   */
  captureStateDigest?: AutomationStudioExplorationStateDigestSource;
  /**
   * The run's own permission gate, when the caller holds one. A recovery
   * builds one gate for the whole recovery, so the exploration and the patch
   * stage answer to one authority and end on one request. It is used as-is:
   * its permitted consequences, the instructed set it was given, and what it was already shown.
   * Passing it together with `permittedConsequences`, `instructionIds` or
   * `shownEvidence` throws, because those build a gate of their own, and two
   * sources for one answer is how they come to disagree.
   */
  gate?: AutomationStudioActionPermissionGate;
  /**
   * The consequences the run is permitted. Absent permits nothing: an
   * action with a lasting consequence then ends the exploration with a
   * request, which is the fail-closed answer rather than a silent refusal.
   */
  permittedConsequences?: readonly string[];
  /** The instructions the run is carrying out, cited by a request as its reason. */
  instructionIds?: readonly string[];
  /**
   * Where a check only a person can complete is handed to them
   * (`personNeeded` on a call's result), with Core's own person-needed wait
   * rather than this ask's `timeoutMs`. Absent, such a call ends the
   * exploration `user_intervention_required` at once.
   */
  ask?: AutomationStudioPermissionAsk;
  /**
   * Evidence the model was shown before the first action -- the failure
   * packet, for a recovery. A request may name a control from it; without it,
   * a name only the failure packet held is withheld from the request.
   */
  shownEvidence?: readonly JsonValue[];
  now?: () => number;
  /** Cancellation from outside. Its own outcome: neither a limit nor a fault. */
  signal?: AbortSignal;
};

export type AutomationStudioRuntimeExploration = {
  schemaVersion: "automation-studio.exploration.v1";
  outcome: AutomationStudioExplorationOutcome;
  /** Core's own sentence for the ending. Never a model's. */
  reason: string;
  /** The code that ended it, in whichever vocabulary produced it. */
  endedBy: string;
  /** Present when the ledger ended it -- which clock, or a request a person must answer. */
  stopReason?: AutomationStudioExplorationStopReason;
  /** Present only on `evidence_gathered`. There is no other branch that writes it. */
  result?: JsonObject;
  /**
   * Present exactly when the exploration stopped on `operator_approval_required`:
   * the action it needed, its consequences, the control as a person would
   * name it and why. What a person allows or refuses from.
   */
  permissionRequest?: AutomationStudioActionPermissionRequest;
  /**
   * Present when a call met a check only a person can complete: how many
   * times the person was asked, and -- when the exploration ended on it rather
   * than going on after Continue -- which person-needed ending it was.
   */
  personNeeded?: { asks: number; ended?: AutomationStudioPersonNeededEnding };
  actions: number;
  observedActions: number;
  refusedActions: number;
  /** Refused actions by kind, when any was classified. Evidence, never a stop (t1057). */
  refusals?: Partial<Record<AutomationStudioExplorationRefusal, number>>;
  /** Actions that were another attempt of an identical earlier one, mutations notwithstanding. Evidence, never a stop (t1057). */
  repeatedActions: number;
  /** Provider decisions that were made and came back unusable, each asked again. */
  unusableDecisions: number;
  accounting: AutomationStudioLlmEvidenceLoopAccounting;
  trace: AutomationStudioLlmEvidenceLoopTrace[];
  /**
   * The two facts the trace cannot carry, per action that ran: the argument it
   * was given, and the state either side of it. Joined to `trace` by `callId`,
   * because one exploration has one record and a second one disagrees with it.
   * Empty when no action ran; digests absent when nothing observed the state.
   */
  steps: readonly AutomationStudioExplorationStepRecord[];
  /** Moments whose digest was asked for and threw. Never fails a step. */
  stateDigestFailures: readonly AutomationStudioExplorationStateDigestFailure[];
  /** Whether anything was bound to say what the state was during this exploration. */
  observedState: boolean;
  durationMs: number;
};

/** One bounded exploration, ending in exactly one of Core's named outcomes. */
export async function runAutomationStudioRuntimeExploration(
  input: AutomationStudioRuntimeExplorationInput
): Promise<AutomationStudioRuntimeExploration> {
  const now = input.now ?? (() => Date.now());
  // First, before the clock starts: a caller that handed both a gate and the
  // fields that build one is refused before anything is held open.
  const gate = explorationPermissionGate(input, now);
  // Exploration is already inside a running Flow: uncovered consequences are evidence the model
  // must route around, never another permission question or a new ending for the task.
  gate.closeAsking();
  const startedAtMs = now();
  const ledger = new AutomationStudioExplorationBudgetLedger({
    budget: input.budget,
    startedAtMs,
    now,
    ...(input.recoveryDeadline ? { recoveryDeadline: input.recoveryDeadline } : {}),
    ...(input.signal ? { externalSignal: input.signal } : {})
  });
  let unusableDecisions = 0;
  // A request the gate raises ends the exploration, fired from here whether or not the gate aborts its
  // own signal (header, t976). A no does not fire it: the model is told and the exploration goes on.
  const permissionRefused = new AbortController();
  // The exploration's own step record, taken where the action is called because
  // that is the only place that holds both the argument the loop discards and
  // the two moments either side of the step.
  const recorder = new AutomationStudioExplorationStateRecorder(input.captureStateDigest ? { digestSource: input.captureStateDigest } : {});
  // Every action goes to the domain through here, so a call that met a check
  // only a person can complete is put to the person before the loop -- and so
  // the model -- sees anything of it. The fresh look after Continue runs
  // through the same executor, under its own call id, and is Core's look rather
  // than the model's, so it is not charged to the ledger as an action.
  const cancelled = [input.ask?.signal, input.signal].filter((signal): signal is AbortSignal => signal !== undefined);
  // Both questions go through a port that says the wait and how it ended, in
  // the phase the repair returns to (`../activity/ask/port.ts`).
  const ask = input.ask ? { ...input.ask, port: automationStudioActivityAskPort(input.ask.port, "repairing") } : undefined;
  const personNeeded = automationStudioPersonNeededToolCalls({
    executeTool: (call) => input.loop.executeTool({
      ...call,
      permission: asking({
        gate,
        action: { kind: "exploration_step", id: call.toolId, ref: call.callId },
        unanswered: permissionRefused
      })
    }),
    tools: input.loop.tools,
    stage: "recovery",
    subject: "exploration",
    newAskId: () => `person-needed.${randomUUID()}`,
    // The port a permission question goes through, and nothing else of that
    // ask: a person completing a check is given Core's own person-needed wait.
    ...(ask ? { ask: { port: ask.port, now: ask.now ?? now } } : {}),
    ...(cancelled.length ? { signal: cancelled.length === 1 ? cancelled[0] : AbortSignal.any(cancelled) } : {})
  });
  // The loop stops on whichever comes first: a clock the ledger found run out,
  // the request the gate raised, or a check the person did not get past. With
  // failures observed rather than ending the loop, each has to stop it by
  // signal as the ledger already does.
  const stopSignal = AbortSignal.any([ledger.signal, gate.signal, permissionRefused.signal, personNeeded.signal]);
  // Loop detection's last rungs (header, `./loop-signal.ts`): a change
  // of approach goes on here, and the model's own decision that it needs a
  // person ends the exploration, since nobody is asked in the middle of a Flow.
  const signalled = automationStudioExplorationLoopSignal();
  try {
    const loopResult = ledger.stopReason
      // Out of time before the first provider call. Refusing here rather than
      // starting and aborting keeps the receipt honest: no call was billed.
      ? undefined
      : await runAutomationStudioLlmEvidenceLoop(observeAutomationStudioEvidenceLoop({
        ...(input.stepLogPageText ? { stepLogPageText: input.stepLogPageText } : {}),
        tools: input.loop.tools, observedStateKeys: input.loop.observedStateKeys, pageChannel: input.loop.pageChannel, controlParameterKeys: input.controlParameterKeys,
        // An answer that could not be used is asked for again, each attempt
        // recorded and charged like any other call; what bounds a loop whose
        // answers stay unusable is the run's purse and clock, never a count
        // (t1049, t1057).
        decide: async (decision) => {
          for (;;) {
            const admitted = ledger.admitProviderCall();
            if (!admitted.admitted) throw new Error(`exploration stopped: ${admitted.stopReason}`);
            try {
              return await input.decide(decision);
            } catch (error) {
              if (!(error instanceof AutomationStudioExplorationUnusableDecisionError)) throw error;
              unusableDecisions += 1;
              // Stopped from outside while the answer was coming back: the
              // loop reads the signal and names the ending, so do not ask again.
              if (decision.signal?.aborted) throw error;
            }
          }
        },
        executeTool: async (call) => {
          const admitted = ledger.admitAction(actionSignature(call.toolId, call.value));
          if (!admitted.admitted) throw new Error(`exploration stopped: ${admitted.stopReason}`);
          // The state either side of the step, and the argument it was given,
          // recorded around the call itself: a reduction needs what the world
          // was. The permission check is handed to the action underneath, by
          // the person-needed wrapper above.
          const execution = await recorder.around(call, () => personNeeded.executeTool(call));
          gate.observe(execution);
          const needsPermission = gate.raisedDuring(call.callId);
          const permissionRefusedHere = gate.declarations.some((entry) => entry.action.ref === call.callId && !entry.permitted);
          // Whether the step was refused, and how: recorded, and shown to the
          // model as the step's result. A refusal is feedback every time (t1057).
          ledger.recordAction({
            ...(needsPermission || permissionRefusedHere ? { refused: "destructive_action_refused" as const } : refusal(execution, input.classifyRefusal))
          });
          // Terminal, not parked: the step is recorded, and the exploration
          // ends here rather than asking the model for something else to try.
          // `classify` reads the gate before anything the loop reports.
          if (needsPermission) throw new Error("exploration stopped: operator_approval_required");
          return execution;
        },
        // No turn or call count is passed: with loop detection's signal the
        // loop is ended by none of its own (`loopSignal`, header), and the
        // ledger counts without stopping. No evidence-bytes total and no
        // evidence window either: the exploration's pages reach the model whole.
        loopSignal: signalled.loopSignal,
        ...(input.completionSchema ? { completionSchema: input.completionSchema } : {}),
        toolFailures: "observe",
        signal: stopSignal
      }));
    return classify({ loopResult, ledger, recorder, permissionRequest: gate.request, personNeeded: { asks: personNeeded.asks(), ended: personNeeded.ended() }, askedForPerson: signalled.askedForPerson(), unusableDecisions, externallyCancelled: input.signal?.aborted === true, durationMs: Math.max(0, now() - startedAtMs) });
  } finally {
    ledger.close();
  }
}

/**
 * The gate's check, ending the exploration on a request it raises (header, t976): nothing is put to a
 * person mid-Flow. A refusal the gate answered as declined is the person's no, told to the model.
 */
function asking(input: {
  gate: AutomationStudioActionPermissionGate;
  action: { kind: "exploration_step"; id: string; ref: string };
  /** Fired when the gate raised a request: the exploration ends on it. */
  unanswered: AbortController;
}): AutomationStudioActionPermissionCheck {
  const check = input.gate.checkFor(input.action);
  return async (declaration) => {
    const decision = await check(declaration);
    if (!decision.permitted && !decision.declined && decision.requestId !== null) input.unanswered.abort();
    return decision;
  };
}

/**
 * The gate every action of this exploration is checked against: the caller's
 * own, or one built here from the loose fields. Never both.
 */
function explorationPermissionGate(input: AutomationStudioRuntimeExplorationInput, now: () => number): AutomationStudioActionPermissionGate {
  if (input.gate) {
    if (input.permittedConsequences !== undefined || input.instructionIds !== undefined || input.shownEvidence !== undefined) {
      throw new Error("A runtime exploration takes a permission gate or the fields that build one, never both.");
    }
    return input.gate;
  }
  const gate = new AutomationStudioActionPermissionGate({
    permittedConsequences: input.permittedConsequences,
    stage: "recovery",
    instructionIds: input.instructionIds,
    now
  });
  for (const shown of input.shownEvidence ?? []) gate.observe(shown);
  return gate;
}

/**
 * The `exploration` stage event for the recovery trace: counts and verdicts,
 * never a model's prose, a page's contents or a repair target.
 *
 * A stage that did not happen says so. An exploration the plan never asked for
 * is `skipped`; one that was asked for and produced nothing is `completed` with
 * its own outcome, because it did run -- calling it `skipped` would be the
 * absence standing in for the failure all over again.
 */
export function automationStudioExplorationTraceEvent(input: {
  requested: boolean;
  exploration?: AutomationStudioRuntimeExploration;
}): AutomationStudioRecoveryTraceEvent {
  const exploration = input.exploration;
  if (!exploration) {
    return {
      stage: "exploration",
      status: "skipped",
      providerCalled: false,
      reason: input.requested ? "The plan asked for exploration and none was run." : "The plan did not call for exploration.",
      detail: { requested: input.requested }
    };
  }
  return {
    stage: "exploration",
    status: EXPLORATION_TRACE_STATUS[exploration.outcome],
    providerCalled: exploration.accounting.iterations > 0,
    loopStage: AUTOMATION_STUDIO_RECOVERY_LOOP_STAGES.exploration,
    reason: exploration.reason,
    detail: {
      requested: input.requested,
      outcome: exploration.outcome,
      endedBy: exploration.endedBy,
      ...(exploration.stopReason ? { stopReason: exploration.stopReason } : {}),
      // The one detail that is not a count: what a person is being asked to
      // allow. Bounded and built by Core, with a control name only when the
      // model had already been shown it.
      ...(exploration.permissionRequest ? { permissionRequest: exploration.permissionRequest } : {}),
      // A check handed to the person: how often they were asked, and the
      // person-needed code when the exploration ended on it. Counts and a code.
      ...(exploration.personNeeded ? { personNeeded: { asks: exploration.personNeeded.asks, ...(exploration.personNeeded.ended ? { ended: AUTOMATION_STUDIO_PERSON_NEEDED_ISSUE_CODES[exploration.personNeeded.ended] } : {}) } } : {}),
      actions: exploration.actions,
      observedActions: exploration.observedActions,
      refusedActions: exploration.refusedActions,
      // What was tried again and what was refused, as evidence (t1057): counts and Core's own kinds.
      ...(exploration.refusals ? { refusals: { ...exploration.refusals } } : {}),
      repeatedActions: exploration.repeatedActions,
      unusableDecisions: exploration.unusableDecisions,
      providerCalls: exploration.accounting.iterations,
      evidenceBytes: exploration.accounting.evidenceBytes,
      durationMs: exploration.durationMs
    }
  };
}

/**
 * How each outcome reads as a stage status. Exhaustive, so an outcome added
 * tomorrow has to be given a status here rather than defaulting to `completed`
 * and reading as though it went fine.
 */
const EXPLORATION_TRACE_STATUS: Readonly<Record<AutomationStudioExplorationOutcome, AutomationStudioRecoveryTraceEvent["status"]>> = Object.freeze({
  evidence_gathered: "completed",
  no_evidence_found: "completed",
  budget_exhausted: "failed",
  no_progress: "failed",
  user_intervention_required: "refused",
  cancelled: "failed",
  failed: "failed"
});

type LoopResult = Awaited<ReturnType<typeof runAutomationStudioLlmEvidenceLoop>>;

function classify(input: {
  loopResult: LoopResult | undefined;
  ledger: AutomationStudioExplorationBudgetLedger;
  recorder: AutomationStudioExplorationStateRecorder;
  permissionRequest: AutomationStudioActionPermissionRequest | undefined;
  personNeeded: { asks: number; ended: AutomationStudioPersonNeededEnding | undefined };
  /** The model decided it could not go on without a person, and the loop ended there (`loopSignal`). */
  askedForPerson: boolean;
  unusableDecisions: number;
  externallyCancelled: boolean;
  durationMs: number;
}): AutomationStudioRuntimeExploration {
  const accounting = input.loopResult?.accounting ?? emptyAccounting();
  const trace = input.loopResult?.trace ?? [];
  const refusals = input.ledger.refusals;
  const base = {
    schemaVersion: "automation-studio.exploration.v1" as const,
    actions: input.ledger.actions,
    observedActions: input.ledger.observedActions,
    refusedActions: input.ledger.refusedActions,
    ...(Object.keys(refusals).length ? { refusals: { ...refusals } } : {}),
    repeatedActions: input.ledger.repeatedActions,
    unusableDecisions: input.unusableDecisions,
    accounting,
    trace,
    // Written on every branch, not just the successful one: a step that ran
    // before a limit stopped the exploration still ran, and a receipt that
    // dropped it would be shorter than the truth.
    steps: input.recorder.stepsAlongside(trace),
    stateDigestFailures: input.recorder.digestFailures,
    observedState: input.recorder.observesState,
    ...(input.personNeeded.asks > 0 || input.personNeeded.ended
      ? { personNeeded: { asks: input.personNeeded.asks, ...(input.personNeeded.ended ? { ended: input.personNeeded.ended } : {}) } }
      : {}),
    durationMs: input.durationMs
  };
  // A request outranks every other ending. The exploration stopped because of
  // it, at the moment it was raised, and it is the one ending a person can do
  // something about; a clock that ran out while the step unwound must not
  // replace it with a number to raise.
  if (input.permissionRequest) {
    return {
      ...base,
      outcome: AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_STOP_REASON.operator_approval_required,
      reason: input.permissionRequest.sentence,
      endedBy: "operator_approval_required",
      stopReason: "operator_approval_required",
      permissionRequest: input.permissionRequest
    };
  }
  // A check the person did not get past comes next, for the same reason: the
  // exploration stopped there, and a clock that ran out while it waited on the
  // person must not turn the ending into a number to raise. No stop reason:
  // the budget did not end it.
  if (input.personNeeded.ended) {
    return {
      ...base,
      outcome: "user_intervention_required",
      reason: PERSON_NEEDED_SENTENCE[input.personNeeded.ended],
      endedBy: AUTOMATION_STUDIO_PERSON_NEEDED_ISSUE_CODES[input.personNeeded.ended]
    };
  }
  const stopReason = input.ledger.stopReason;
  if (stopReason) {
    return {
      ...base,
      outcome: AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_STOP_REASON[stopReason],
      reason: STOP_REASON_SENTENCE[stopReason],
      endedBy: stopReason,
      stopReason
    };
  }
  if (input.externallyCancelled || !input.loopResult) {
    return { ...base, outcome: "cancelled", reason: "The exploration was stopped from outside before it reached an answer.", endedBy: "exploration.cancelled" };
  }
  // The model's own loop decision, not a count: it said it needs a person, and
  // nobody is asked in the middle of a Flow (header). What it gathered goes on
  // to the recovery as any other ending's does.
  if (!input.loopResult.ok && input.askedForPerson) {
    return {
      ...base,
      outcome: "no_progress",
      reason: "The exploration decided it could not go on without a person, and nobody is asked in the middle of a Flow, so it ended with what it had gathered.",
      endedBy: AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_SIGNAL_CODES.ask_person
    };
  }
  if (!input.loopResult.ok) {
    return {
      ...base,
      outcome: AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_LOOP_FAILURE[input.loopResult.code],
      reason: `The exploration loop ended with ${input.loopResult.code}.`,
      endedBy: input.loopResult.code
    };
  }
  const outcome = automationStudioExplorationCompletionOutcome({
    observedActions: input.ledger.observedActions,
    evidenceBytes: accounting.evidenceBytes,
    result: input.loopResult.result
  });
  if (outcome === "no_evidence_found") {
    return { ...base, outcome, reason: "The exploration finished without gathering any evidence it could answer from.", endedBy: "exploration.completed" };
  }
  return {
    ...base,
    outcome,
    reason: `The exploration gathered evidence from ${input.ledger.observedActions} action(s) and completed.`,
    endedBy: "exploration.completed",
    result: input.loopResult.result
  };
}

/** How a check handed to the person ended the exploration, in Core's own words. */
const PERSON_NEEDED_SENTENCE: Readonly<Record<AutomationStudioPersonNeededEnding, string>> = Object.freeze({
  stopped: "The exploration met a check only a person can complete, and the person pressed Stop.",
  timed_out: "The exploration met a check only a person can complete, and nobody completed it in time.",
  unreachable: "The exploration met a check only a person can complete, and there was nowhere to ask the person.",
  cancelled: "The exploration met a check only a person can complete, and was stopped while it waited for the person.",
  asks_exhausted: "The exploration kept meeting a check only a person can complete after the person pressed Continue, so it stopped asking the person and ended."
});

const STOP_REASON_SENTENCE: Readonly<Record<AutomationStudioExplorationStopReason, string>> = Object.freeze({
  wall_clock_expired: "The exploration ran out of its own time before it reached an answer.",
  recovery_deadline_expired: "The recovery as a whole ran out of time, so the exploration was stopped.",
  operator_approval_required: "The exploration needed an action the run was not permitted to take, and stopped to ask a person for it."
});

function refusal(
  execution: JsonValue | AutomationStudioLlmEvidenceToolExecutionResult,
  classifyRefusal: AutomationStudioExplorationRefusalClassifier | undefined
): { refused?: AutomationStudioExplorationRefusal } {
  if (!classifyRefusal) return {};
  const resultCode = executionResultCode(execution);
  if (resultCode === undefined) return {};
  const refused = classifyRefusal(resultCode);
  if (!refused) return {};
  // A domain that answers outside Core's refusal kinds -- `operator_approval_required`, say, which only the gate
  // can raise because only the gate holds a request -- has still read the code as a refusal: it is reported as one.
  return { refused: (AUTOMATION_STUDIO_EXPLORATION_REFUSALS as readonly string[]).includes(refused) ? refused : "destructive_action_refused" };
}

function executionResultCode(execution: JsonValue | AutomationStudioLlmEvidenceToolExecutionResult): string | undefined {
  if (!execution || typeof execution !== "object" || Array.isArray(execution)) return undefined;
  const candidate = (execution as { kind?: unknown; resultCode?: unknown });
  if (candidate.kind !== "llm_evidence_tool_execution" || typeof candidate.resultCode !== "string") return undefined;
  return candidate.resultCode;
}

/** One action's identity: what it did and with what, independent of call id. */
function actionSignature(toolId: string, value: JsonObject): string {
  return `${toolId}|${canonicalJson(value)}`;
}

function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as JsonObject)[key] as JsonValue)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function emptyAccounting(): AutomationStudioLlmEvidenceLoopAccounting {
  return { iterations: 0, toolCalls: 0, evidenceBytes: 0, inputTokens: 0, cacheHitInputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 };
}
