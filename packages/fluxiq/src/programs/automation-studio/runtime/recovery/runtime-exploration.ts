// Running the exploration loop at run time, under a budget, with exactly one
// named outcome at the end of it.
//
// **No loop is written here.** `AS/runtime/llm/evidence-loop.ts` already is
// one, it is already domain-neutral, and Phase H gave it a registry, Core's own
// neutral options and the grant that lets a failed run reach it. This is the
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
// every abort there is, so if the classifier trusted it, a wall clock, an
// action cap, a repeat cycle and a refused action would all come back as one
// word. The ledger recorded the real reason at the moment it refused, and the
// classifier reads that first.
//
// **A result exists only when evidence was gathered.** `result` is written on
// the `evidence_gathered` branch and nowhere else, so a caller physically
// cannot read a finding out of an exploration that was stopped, refused or
// empty. `evidence_gathered` itself is constructible only from an action that
// returned evidence -- Phase D's rule, applied one layer further out.
//
// **An action the run was not allowed is a question for a person, and ends
// the exploration.** Every action is handed the run's permission check. When
// the domain declares a lasting consequence the run does not hold, the gate
// raises a request and the exploration stops there with
// `operator_approval_required`, carrying it. Nothing else raises that reason:
// a domain's own refusal code cannot, because a stop with no request in hand
// would ask a person a question nobody can answer.

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import { AutomationStudioActionPermissionGate, type AutomationStudioActionPermissionRequest } from "../action-permissions/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS } from "../loop-limits/index.ts";
import {
  runAutomationStudioLlmEvidenceLoop,
  type AutomationStudioHarnessOptionLoopBinding,
  type AutomationStudioLlmEvidenceLoopAccounting,
  type AutomationStudioLlmEvidenceLoopInput,
  type AutomationStudioLlmEvidenceLoopTrace,
  type AutomationStudioLlmEvidenceToolExecutionResult
} from "../llm/index.ts";
import {
  AUTOMATION_STUDIO_EXPLORATION_BUDGET_CEILINGS,
  AutomationStudioExplorationBudgetLedger,
  type AutomationStudioExplorationBudget
} from "./exploration-budget.ts";
import {
  AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_LOOP_FAILURE,
  AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_STOP_REASON,
  automationStudioExplorationCompletionOutcome,
  type AutomationStudioExplorationOutcome,
  type AutomationStudioExplorationStopReason
} from "./exploration-outcome.ts";
import {
  AutomationStudioExplorationStateRecorder,
  type AutomationStudioExplorationStateDigestFailure,
  type AutomationStudioExplorationStateDigestSource,
  type AutomationStudioExplorationStepRecord
} from "./exploration-state/index.ts";
import { automationStudioExplorationEvidenceDigest, type AutomationStudioExplorationNoProgressReason } from "./progress-guard.ts";
import type { AutomationStudioRecoveryDeadline } from "./recovery-deadline.ts";
import { AUTOMATION_STUDIO_RECOVERY_LOOP_STAGES, type AutomationStudioRecoveryTraceEvent } from "./trace.ts";
import { AutomationStudioExplorationUnusableDecisionError } from "./unusable-decision.ts";

/**
 * How a domain translates its own refusal codes into Core's stop reasons.
 *
 * Core cannot read `web.action.rejected.target_unsafe`, and must not learn to:
 * the refusal is semantic and the meaning belongs to whoever owns the medium
 * (decision L3). So the domain is handed an opaque string and answers in Core's
 * closed vocabulary, or answers nothing -- and nothing means ordinary feedback,
 * which the loop already knows how to give back to the model.
 */
export type AutomationStudioExplorationRefusalClassifier = (resultCode: string) => AutomationStudioExplorationStopReason | undefined;

export type AutomationStudioRuntimeExplorationInput = {
  /** The tools and the dispatch, from the harness-option registry. */
  loop: AutomationStudioHarnessOptionLoopBinding;
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
   * The consequences the run's grant permits. Absent permits nothing: an
   * action with a lasting consequence then ends the exploration with a
   * request, which is the fail-closed answer rather than a silent refusal.
   */
  permittedConsequences?: readonly string[];
  /** The instructions the run is carrying out, cited by a request as its reason. */
  instructionIds?: readonly string[];
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
  /** Present when the budget ended it, and it says which limit. */
  stopReason?: AutomationStudioExplorationStopReason;
  /** Present only on `no_progress`, and it says what the loop kept doing. */
  noProgressReason?: AutomationStudioExplorationNoProgressReason;
  /** Present only on `evidence_gathered`. There is no other branch that writes it. */
  result?: JsonObject;
  /**
   * Present exactly when the exploration stopped on `operator_approval_required`:
   * the action it needed, its consequences, the control as a person would
   * name it and why. What a person grants or refuses from.
   */
  permissionRequest?: AutomationStudioActionPermissionRequest;
  actions: number;
  observedActions: number;
  refusedActions: number;
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
  const startedAtMs = now();
  const ledger = new AutomationStudioExplorationBudgetLedger({
    budget: input.budget,
    startedAtMs,
    now,
    ...(input.recoveryDeadline ? { recoveryDeadline: input.recoveryDeadline } : {}),
    ...(input.signal ? { externalSignal: input.signal } : {})
  });
  let unusableDecisions = 0;
  // The exploration's own step record, taken where the action is called because
  // that is the only place that holds both the argument the loop discards and
  // the two moments either side of the step.
  const recorder = new AutomationStudioExplorationStateRecorder(input.captureStateDigest ? { digestSource: input.captureStateDigest } : {});
  const gate = new AutomationStudioActionPermissionGate({
    permittedConsequences: input.permittedConsequences,
    stage: "recovery",
    instructionIds: input.instructionIds,
    now
  });
  for (const shown of input.shownEvidence ?? []) gate.observe(shown);
  try {
    const loopResult = ledger.stopReason
      // Out of time before the first provider call. Refusing here rather than
      // starting and aborting keeps the receipt honest: no call was billed.
      ? undefined
      : await runAutomationStudioLlmEvidenceLoop({
        tools: input.loop.tools,
        // An answer that could not be used is asked for again, each attempt
        // admitted and charged like any other call. It is a step that did not
        // advance, so the progress guard -- not the call backstop -- is what
        // ends a loop whose answers stay unusable, and it says why.
        decide: async (decision) => {
          for (;;) {
            const admitted = ledger.admitProviderCall();
            if (!admitted.admitted) throw new Error(`exploration stopped: ${admitted.stopReason}`);
            try {
              return await input.decide(decision);
            } catch (error) {
              if (!(error instanceof AutomationStudioExplorationUnusableDecisionError)) throw error;
              unusableDecisions += 1;
              ledger.recordUnusableDecision();
              // Stopped from outside while the answer was coming back: the
              // loop reads the signal and names the ending, so do not ask again.
              if (decision.signal?.aborted) throw error;
            }
          }
        },
        executeTool: async (call) => {
          const signature = actionSignature(call.toolId, call.value);
          const admitted = ledger.admitAction(signature);
          if (!admitted.admitted) throw new Error(`exploration stopped: ${admitted.stopReason}`);
          // The state either side of the step, and the argument it was given,
          // recorded around the call itself. Deliberately not the evidence
          // digest below: that is what the step said, and a reduction needs
          // what the world was.
          const permission = gate.checkFor({ kind: "exploration_step", id: call.toolId, ref: call.callId });
          const execution = await recorder.around(call, () => input.loop.executeTool({ ...call, permission }));
          gate.observe(execution);
          const needsPermission = gate.raisedDuring(call.callId);
          // What the step asked for and what came back, recorded together. The
          // ledger needs both to answer whether the exploration is still
          // learning: a repeated request and a new request that returned an
          // answer already held are different findings, and neither of them is
          // visible from the action alone.
          const evidence = evidenceValue(execution);
          const evidenceText = canonicalJson(evidence);
          ledger.recordAction({
            signature,
            evidenceDigest: automationStudioExplorationEvidenceDigest(evidenceText),
            evidenceBytes: emptyEvidence(evidence) ? 0 : Buffer.byteLength(evidenceText, "utf8"),
            ...(needsPermission ? { refused: "operator_approval_required" as const } : refusal(execution, input.classifyRefusal))
          });
          // Terminal, not parked: the step is recorded, and the exploration
          // ends here rather than asking the model for something else to try.
          // `classify` reads the gate before anything the loop reports.
          if (needsPermission) throw new Error("exploration stopped: operator_approval_required");
          return execution;
        },
        // The ledger is the binding limit on actions and provider calls, so it
        // can name which one was hit; the loop keeps Core's ceilings underneath
        // as the backstop. Evidence bytes stay the loop's, which already
        // enforces them per call and reports `evidence_limit`.
        maxIterations: Math.min(AUTOMATION_STUDIO_EXPLORATION_BUDGET_CEILINGS.maxProviderCalls, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxIterations),
        maxToolCalls: Math.min(AUTOMATION_STUDIO_EXPLORATION_BUDGET_CEILINGS.maxActions, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxToolCalls),
        maxEvidenceBytes: input.budget.maxEvidenceBytes,
        ...(input.completionSchema ? { completionSchema: input.completionSchema } : {}),
        signal: ledger.signal
      });
    return classify({ loopResult, ledger, recorder, permissionRequest: gate.request, unusableDecisions, externallyCancelled: input.signal?.aborted === true, durationMs: Math.max(0, now() - startedAtMs) });
  } finally {
    ledger.close();
  }
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
      ...(exploration.noProgressReason ? { noProgressReason: exploration.noProgressReason } : {}),
      // The one detail that is not a count: what a person is being asked to
      // allow. Bounded and built by Core, with a control name only when the
      // model had already been shown it.
      ...(exploration.permissionRequest ? { permissionRequest: exploration.permissionRequest } : {}),
      actions: exploration.actions,
      observedActions: exploration.observedActions,
      refusedActions: exploration.refusedActions,
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
  unsafe_action_blocked: "refused",
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
  unusableDecisions: number;
  externallyCancelled: boolean;
  durationMs: number;
}): AutomationStudioRuntimeExploration {
  const accounting = input.loopResult?.accounting ?? emptyAccounting();
  const trace = input.loopResult?.trace ?? [];
  const base = {
    schemaVersion: "automation-studio.exploration.v1" as const,
    actions: input.ledger.actions,
    observedActions: input.ledger.observedActions,
    refusedActions: input.ledger.refusedActions,
    unusableDecisions: input.unusableDecisions,
    accounting,
    trace,
    // Written on every branch, not just the successful one: a step that ran
    // before a limit stopped the exploration still ran, and a receipt that
    // dropped it would be shorter than the truth.
    steps: input.recorder.stepsAlongside(trace),
    stateDigestFailures: input.recorder.digestFailures,
    observedState: input.recorder.observesState,
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
  const stopReason = input.ledger.stopReason;
  if (stopReason) {
    const noProgressReason = input.ledger.noProgressReason;
    return {
      ...base,
      outcome: AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_STOP_REASON[stopReason],
      reason: noProgressReason ? NO_PROGRESS_SENTENCE[noProgressReason] : STOP_REASON_SENTENCE[stopReason],
      endedBy: stopReason,
      stopReason,
      ...(noProgressReason ? { noProgressReason } : {})
    };
  }
  if (input.externallyCancelled || !input.loopResult) {
    return { ...base, outcome: "cancelled", reason: "The exploration was stopped from outside before it reached an answer.", endedBy: "exploration.cancelled" };
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

/**
 * What going in circles looked like, in Core's own words.
 *
 * Three sentences rather than one, because they are three different things to
 * do next: narrow what is being asked for, give the model something it has not
 * already been given, or find out why every step comes back empty.
 */
const NO_PROGRESS_SENTENCE: Readonly<Record<AutomationStudioExplorationNoProgressReason, string>> = Object.freeze({
  repeated_request: "The exploration kept asking for something it had already asked for, so it was stopped.",
  repeated_evidence: "The exploration kept gathering evidence it already had, so it was stopped.",
  no_new_evidence: "The exploration kept taking steps that returned nothing new, so it was stopped.",
  unusable_decision: "The model kept answering with something the exploration could not use, so it was stopped."
});

const STOP_REASON_SENTENCE: Readonly<Record<AutomationStudioExplorationStopReason, string>> = Object.freeze({
  wall_clock_expired: "The exploration ran out of its own time before it reached an answer.",
  recovery_deadline_expired: "The recovery as a whole ran out of time, so the exploration was stopped.",
  action_limit: "The exploration used every action it was allowed before it reached an answer.",
  provider_call_limit: "The exploration used every provider call it was allowed before it reached an answer.",
  repeat_window: "The exploration kept attempting the same action, so it was stopped.",
  no_progress: "The exploration had stopped learning anything new, so it was stopped.",
  destructive_action_refused: "The exploration asked to do something destructive and was refused.",
  out_of_scope_refused: "The exploration asked to go outside the scope it was given and was refused.",
  refusal_limit: "Every action the exploration had left to try was refused.",
  operator_approval_required: "The exploration needed an action the run was not permitted to take, and stopped to ask a person for it."
});

function refusal(
  execution: JsonValue | AutomationStudioLlmEvidenceToolExecutionResult,
  classifyRefusal: AutomationStudioExplorationRefusalClassifier | undefined
): { refused?: AutomationStudioExplorationStopReason } {
  if (!classifyRefusal) return {};
  const resultCode = executionResultCode(execution);
  if (resultCode === undefined) return {};
  const refused = classifyRefusal(resultCode);
  // Only the gate raises `operator_approval_required`, because only the gate
  // holds a request to raise it with. A domain code read as one here is a
  // refusal with nobody to ask, and is reported as the refusal it is.
  if (refused === "operator_approval_required") return { refused: "destructive_action_refused" };
  return refused ? { refused } : {};
}

/** What an execution actually carried, whatever shape the domain returned it in.
 * A missing value is `null`, so the digest below always has text to work on. */
function evidenceValue(execution: JsonValue | AutomationStudioLlmEvidenceToolExecutionResult): JsonValue {
  if (!execution || typeof execution !== "object" || Array.isArray(execution)) return (execution ?? null) as JsonValue;
  const candidate = execution as { kind?: unknown; evidence?: unknown };
  return candidate.kind === "llm_evidence_tool_execution" ? ((candidate.evidence ?? null) as JsonValue) : (execution as JsonValue);
}

/** Whether a step came back with nothing in it. Serialized, `""` and `{}` are
 * still a few bytes; as evidence they are nothing, and counting them as an
 * answer would let a loop of empty steps look like one that is learning. */
function emptyEvidence(value: JsonValue): boolean {
  if (value === null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  return typeof value === "object" && Object.keys(value).length === 0;
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
  return { iterations: 0, toolCalls: 0, evidenceBytes: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 };
}
