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

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
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
import type { AutomationStudioRecoveryDeadline } from "./recovery-deadline.ts";
import { AUTOMATION_STUDIO_RECOVERY_LOOP_STAGES, type AutomationStudioRecoveryTraceEvent } from "./trace.ts";

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
  decide: AutomationStudioLlmEvidenceLoopInput["decide"];
  budget: AutomationStudioExplorationBudget;
  /** The whole recovery's clock, when one is running. Binds ahead of the budget's. */
  recoveryDeadline?: AutomationStudioRecoveryDeadline;
  completionSchema?: JsonObject;
  classifyRefusal?: AutomationStudioExplorationRefusalClassifier;
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
  /** Present only on `evidence_gathered`. There is no other branch that writes it. */
  result?: JsonObject;
  actions: number;
  observedActions: number;
  refusedActions: number;
  accounting: AutomationStudioLlmEvidenceLoopAccounting;
  trace: AutomationStudioLlmEvidenceLoopTrace[];
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
  try {
    const loopResult = ledger.stopReason
      // Out of time before the first provider call. Refusing here rather than
      // starting and aborting keeps the receipt honest: no call was billed.
      ? undefined
      : await runAutomationStudioLlmEvidenceLoop({
        tools: input.loop.tools,
        decide: async (decision) => {
          const admitted = ledger.admitProviderCall();
          if (!admitted.admitted) throw new Error(`exploration stopped: ${admitted.stopReason}`);
          return input.decide(decision);
        },
        executeTool: async (call) => {
          const admitted = ledger.admitAction(actionSignature(call.toolId, call.value));
          if (!admitted.admitted) throw new Error(`exploration stopped: ${admitted.stopReason}`);
          const execution = await input.loop.executeTool(call);
          ledger.recordAction(refusal(execution, input.classifyRefusal));
          return execution;
        },
        // The ledger is the binding limit on actions and provider calls, so it
        // can name which one was hit; the loop keeps Core's ceilings underneath
        // as the backstop. Evidence bytes stay the loop's, which already
        // enforces them per call and reports `evidence_limit`.
        maxIterations: AUTOMATION_STUDIO_EXPLORATION_BUDGET_CEILINGS.maxProviderCalls,
        maxToolCalls: AUTOMATION_STUDIO_EXPLORATION_BUDGET_CEILINGS.maxActions,
        maxEvidenceBytes: input.budget.maxEvidenceBytes,
        ...(input.completionSchema ? { completionSchema: input.completionSchema } : {}),
        signal: ledger.signal
      });
    return classify({ loopResult, ledger, externallyCancelled: input.signal?.aborted === true, durationMs: Math.max(0, now() - startedAtMs) });
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
      actions: exploration.actions,
      observedActions: exploration.observedActions,
      refusedActions: exploration.refusedActions,
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
  unsafe_action_blocked: "refused",
  user_intervention_required: "refused",
  cancelled: "failed",
  failed: "failed"
});

type LoopResult = Awaited<ReturnType<typeof runAutomationStudioLlmEvidenceLoop>>;

function classify(input: {
  loopResult: LoopResult | undefined;
  ledger: AutomationStudioExplorationBudgetLedger;
  externallyCancelled: boolean;
  durationMs: number;
}): AutomationStudioRuntimeExploration {
  const accounting = input.loopResult?.accounting ?? emptyAccounting();
  const base = {
    schemaVersion: "automation-studio.exploration.v1" as const,
    actions: input.ledger.actions,
    observedActions: input.ledger.observedActions,
    refusedActions: input.ledger.refusedActions,
    accounting,
    trace: input.loopResult?.trace ?? [],
    durationMs: input.durationMs
  };
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

const STOP_REASON_SENTENCE: Readonly<Record<AutomationStudioExplorationStopReason, string>> = Object.freeze({
  wall_clock_expired: "The exploration ran out of its own time before it reached an answer.",
  recovery_deadline_expired: "The recovery as a whole ran out of time, so the exploration was stopped.",
  action_limit: "The exploration used every action it was allowed before it reached an answer.",
  provider_call_limit: "The exploration used every provider call it was allowed before it reached an answer.",
  repeat_window: "The exploration kept attempting the same action, so it was stopped.",
  destructive_action_refused: "The exploration asked to do something destructive and was refused.",
  out_of_scope_refused: "The exploration asked to go outside the scope it was given and was refused.",
  refusal_limit: "Every action the exploration had left to try was refused.",
  operator_approval_required: "The exploration cannot go further without a person."
});

function refusal(
  execution: JsonValue | AutomationStudioLlmEvidenceToolExecutionResult,
  classifyRefusal: AutomationStudioExplorationRefusalClassifier | undefined
): { refused?: AutomationStudioExplorationStopReason } {
  if (!classifyRefusal) return {};
  const resultCode = executionResultCode(execution);
  if (resultCode === undefined) return {};
  const refused = classifyRefusal(resultCode);
  return refused ? { refused } : {};
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
