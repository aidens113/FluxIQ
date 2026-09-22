import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_MAX_CONSECUTIVE_UNUSABLE_DECISIONS } from "../loop-limits/index.ts";
import {
  applyAutomationStudioFlowDraftAmendments,
  automationStudioFlowDraftEntry,
  type AutomationStudioFlowDraftAmendment,
  type AutomationStudioFlowDraftStep
} from "../flow-draft/index.ts";
import { automationStudioLlmEvidenceContextWindow, type AutomationStudioLlmEvidenceRecord } from "./context-window.ts";
import {
  automationStudioLlmEvidenceCanonicalJson,
  automationStudioLlmEvidenceParseCompletionCheck,
  automationStudioLlmEvidenceParseDecision,
  automationStudioLlmEvidenceParseToolExecutionResult,
  automationStudioLlmEvidenceValidTools,
  buildAutomationStudioLlmEvidenceLoopDecisionSchema
} from "./evidence-loop-decision.ts";
import { automationStudioLlmEvidenceLookNeedsAttempt, automationStudioLlmEvidenceRequestSignature } from "./repeat-policy.ts";
import { automationStudioLlmEvidenceBudgetEntry, automationStudioLlmEvidenceLoopBudgetValid, automationStudioLlmEvidenceLoopRemaining, type AutomationStudioLlmEvidenceLoopBudget } from "./loop-budget.ts";
import type { AutomationStudioLlmUsageSummary } from "./harness.ts";
import { AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST } from "./harness/index.ts";
import { automationStudioLlmTokenBudgetBytes } from "./token-estimation.ts";
import { automationStudioLlmEvidenceToolFailure, type AutomationStudioLlmEvidenceToolFailureCode } from "./tool-failure.ts";
import {
  AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID,
  AutomationStudioLlmUnusableDecisionError,
  automationStudioLlmUnusableDecisionFeedback,
  automationStudioLlmUnusableDecisionIssueSet
} from "./unusable-decision.ts";

// The ceilings are held in runtime/loop-limits/ because runtime/recovery/ is
// bounded by the same three numbers, and a constant both directories read is
// how an import edge grows between them. Re-exported here so the loop's public
// surface is unchanged: every existing consumer still reads it from
// runtime/llm/.
export { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS };
// The decision grammar lives in `evidence-loop-decision.ts`: one module says
// what a decision may be, this one says what to do about each. Re-exported so
// every existing consumer still reads the schema builder from here.
export { buildAutomationStudioLlmEvidenceLoopDecisionSchema } from "./evidence-loop-decision.ts";
/** The draft a loop accrues while it explores, and how the model edits it. */
export { AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID, type AutomationStudioFlowDraftAmendment, type AutomationStudioFlowDraftStep } from "../flow-draft/index.ts";
// The error a decision callback throws to have the loop ask again, and how a
// caller tells whether a failed call is that kind of failure. Part of the
// loop's input contract, so published with it.
export {
  AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID,
  AutomationStudioLlmUnusableDecisionError,
  automationStudioLlmTaskResultSpentWithoutDecision,
  automationStudioLlmUnusableDecisionError
} from "./unusable-decision.ts";
/** The codes a failed tool call is recorded and shown under; see `toolFailures`. */
export type { AutomationStudioLlmEvidenceToolFailureCode } from "./tool-failure.ts";
/** The entry a decision's evidence lists earlier calls under once their results no longer fit. */
export { AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID } from "./context-window.ts";
/** The bounds a loop may be given (`budget`), and the entry it shows the model what is left under. */
export { AUTOMATION_STUDIO_LLM_EVIDENCE_BUDGET_TOOL_ID, type AutomationStudioLlmEvidenceLoopBudget } from "./loop-budget.ts";

/** Provider-neutral decision policy for bounded evidence loops, in
 * `evidence-loop-decision.ts` with the rest of the grammar. */
export { AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_INSTRUCTION } from "./evidence-loop-decision.ts";

/**
 * Unusable decisions in a row, however much their issues differ, after which a
 * loop that asks again stops: the far backstop under the no-progress guard. A
 * model fixing one mistake at a time is progress, so this is set well past the
 * handful of refusals a real correction takes; the cost, token and deadline
 * guards still bind underneath it. Held to the loop's own iterations.
 */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_UNUSABLE_DECISIONS_IN_A_ROW = 12;

/** The evidence entry the loop's answer to a repeated request arrives under. */
const REQUEST_CHECK_TOOL_ID = "core.request_check";

/** What a request the loop answered itself, rather than running, is recorded as. */
const ANSWERED_REQUEST = {
  "llm_evidence_loop.already_answered": "This exact request was already answered and nothing has changed since, so it was not run again. Its result is the evidence entry named by answeredByCallId, placed just before this one. Use it, or choose a different tool or input, or complete.",
  "llm_evidence_loop.already_observed": "This observation was already made and no action has changed anything since, so it was not run again. Its latest result is the evidence entry named by answeredByCallId, placed just before this one. Use it, change something first, or complete."
} as const;

type AnsweredRequestCode = keyof typeof ANSWERED_REQUEST;

export type AutomationStudioLlmEvidenceTool = {
  toolId: string;
  description: string;
  inputSchema: JsonObject;
  effect?: "observe" | "mutate";
  repeatPolicy?: "after_mutation";
  /** Optional domain-declared observation that is safe to run before the first
   * provider decision. The coordinator executes at most one such declaration. */
  initialObservation?: { input: JsonObject };
};

export type AutomationStudioLlmEvidenceLoopDecision =
  | { kind: "tool_call"; callId: string; toolId: string; input: JsonObject; usage?: AutomationStudioLlmUsageSummary }
  /** An edit to the draft the loop is accruing. Offered only once there is a step to edit. */
  | { kind: "amend_draft"; amendments: readonly AutomationStudioFlowDraftAmendment[]; usage?: AutomationStudioLlmUsageSummary }
  | { kind: "complete"; result: JsonObject; usage?: AutomationStudioLlmUsageSummary };

export type AutomationStudioLlmEvidenceLoopTrace = {
  iteration: number;
  /** `unusable` is a decision call that was made and came back as nothing the
   * loop could act on, and was asked again. It names no tool. */
  decision: "tool_call" | "complete" | "unusable" | "amend_draft";
  callId?: string;
  toolId?: string;
  evidenceBytes?: number;
  effectApplied?: boolean;
  resultCode?: string;
  usage?: AutomationStudioLlmUsageSummary;
};

export type AutomationStudioLlmEvidenceToolExecutionResult = {
  kind: "llm_evidence_tool_execution";
  evidence: JsonValue;
  effectApplied: boolean;
  /** True only when every target handle from before this mutation still names
   * the same target afterwards. Consumers may omit it and stay conservative. */
  targetsUnchanged?: boolean;
  resultCode?: string;
};

/**
 * What a caller's check made of a completed result. A refusal names why, in
 * issue codes, and carries the feedback the model is shown before it is asked
 * again: bounded JSON the caller authored -- what was wrong and where -- never
 * content the model has not already seen from its own tools.
 */
export type AutomationStudioLlmEvidenceCompletionCheck =
  | { ok: true }
  | { ok: false; issueCodes: readonly string[]; feedback: JsonObject };

/** The evidence entry a refused completion's feedback arrives under. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID = "core.completion_check";

export type AutomationStudioLlmEvidenceLoopFailureCode =
  | "llm_evidence_loop.invalid_configuration"
  | "llm_evidence_loop.invalid_decision"
  | "llm_evidence_loop.unknown_tool"
  // These two are no longer produced. A reused call id is replaced with one the
  // loop assigns, and a repeated request is answered, a run of them ending the
  // loop as `repeat_without_progress`. Kept because the outcome tables callers
  // key by this union still name them, and a stored result may carry them.
  | "llm_evidence_loop.duplicate_call"
  | "llm_evidence_loop.duplicate_tool_request"
  /** The no-progress guard tripped: the loop kept repeating itself. */
  | "llm_evidence_loop.repeat_without_progress"
  | "llm_evidence_loop.tool_failed"
  /** What was gathered in total reached the far backstop, `maxEvidenceBytes`. */
  | "llm_evidence_loop.evidence_limit"
  | "llm_evidence_loop.iteration_limit"
  | "llm_evidence_loop.cancelled";

export type AutomationStudioLlmEvidenceLoopResult =
  | {
    ok: true;
    result: JsonObject;
    trace: AutomationStudioLlmEvidenceLoopTrace[];
    /** Every action the loop took, in order, with the argument it was given. */
    steps: AutomationStudioFlowDraftStep[];
    accounting: AutomationStudioLlmEvidenceLoopAccounting;
  }
  | {
    ok: false;
    code: AutomationStudioLlmEvidenceLoopFailureCode;
    trace: AutomationStudioLlmEvidenceLoopTrace[];
    /** The same, for a loop that ended without a result: a failed build still did things. */
    steps: AutomationStudioFlowDraftStep[];
    accounting: AutomationStudioLlmEvidenceLoopAccounting;
  };

export type AutomationStudioLlmEvidenceLoopAccounting = {
  iterations: number;
  toolCalls: number;
  evidenceBytes: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
};

export type AutomationStudioLlmEvidenceLoopInput = {
  tools: AutomationStudioLlmEvidenceTool[];
  decide(input: {
    iteration: number;
    tools: AutomationStudioLlmEvidenceTool[];
    evidence: ReadonlyArray<{ callId: string; toolId: string; value: JsonValue }>;
    decisionSchema: JsonObject;
    canComplete: boolean;
    signal?: AbortSignal;
  }): Promise<unknown>;
  executeTool(input: { callId: string; toolId: string; value: JsonObject; maxEvidenceBytes: number; signal?: AbortSignal }): Promise<JsonValue | AutomationStudioLlmEvidenceToolExecutionResult>;
  maxIterations?: number;
  maxToolCalls?: number;
  /**
   * The far backstop on everything the loop gathers, counted in `accounting`.
   * Reaching it ends the loop `llm_evidence_loop.evidence_limit`. What a
   * decision is shown is bounded by `maxEvidenceContextBytes` instead, so this
   * is set where cost, tokens, the deadline and the no-progress guard end a
   * loop first. Absent, the ceiling.
   */
  maxEvidenceBytes?: number;
  /**
   * What one decision is shown of the evidence, in bytes, and within what the
   * one per-request token ceiling carries. Each tool is offered this less 512
   * bytes, whatever has been gathered before, so a call is never handed the
   * scraps of a total and refused for want of room.
   */
  maxEvidenceContextBytes?: number;
  /**
   * The run's own bounds -- tokens, cost, time -- from which the loop works out
   * before each decision how many it has left, the iteration count being only
   * the backstop among them. With one given, the model is shown what is left
   * as the newest entry (`AUTOMATION_STUDIO_LLM_EVIDENCE_BUDGET_TOOL_ID`); the
   * last decision is offered only completion; and with none left the loop ends
   * `llm_evidence_loop.iteration_limit`. Absent, none of that happens.
   */
  budget?: AutomationStudioLlmEvidenceLoopBudget;
  completionSchema?: JsonObject;
  minToolCalls?: number;
  propagateDecisionErrors?: boolean;
  /**
   * The no-progress guard: how many steps in a row may give the loop nothing
   * new before it ends.
   *
   * A step gives nothing new when it asks for a tool request already answered
   * with nothing changed since, when it asks to repeat an observation no action
   * has changed, or when it is an unusable decision refused for a set of issues
   * already seen since the last tool result. The loop answers the first two
   * itself -- the earlier result is placed at the end of the evidence with a
   * note naming it, and the tool is not run -- and tells the model about the
   * third. A tool that runs resets the count. An unusable decision refused for
   * issues not seen since then is new: the count starts again at one.
   *
   * The step that reaches the guard ends the loop: a repeated request as
   * `llm_evidence_loop.repeat_without_progress`, an unusable decision through
   * `unusableDecisions.stalled`.
   *
   * Absent, `unusableDecisions.maxConsecutive` when that is set, otherwise
   * three, held to `maxIterations`. Given both, they must agree.
   */
  maxStepsWithoutProgress?: number;
  /**
   * Ask again after an unusable decision instead of ending.
   *
   * When set, a `decide` that throws `AutomationStudioLlmUnusableDecisionError`
   * spends that iteration -- one provider call, so `maxIterations` still bounds
   * every call the loop makes -- is recorded as an `unusable` step, the model
   * is told the issue codes and the decision shape as evidence under
   * `AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID`, and the loop
   * asks again. Two things end it, and `stalled` builds the error that does,
   * which is then handled exactly as if `decide` had thrown it (thrown under
   * `propagateDecisionErrors`, otherwise `llm_evidence_loop.invalid_decision`):
   * an unusable decision that reaches the no-progress guard, and the
   * `maxInARow`-th unusable decision in a row however different their issues.
   * A usable decision resets the second count.
   *
   * Absent, the error is an ordinary decision error, as it always was. Any
   * other error `decide` throws is unaffected either way.
   *
   * A completed result that `checkCompletion` refuses is an unusable decision
   * too, and joins the same counts.
   */
  unusableDecisions?: {
    /** The no-progress guard's length, when `maxStepsWithoutProgress` is not given. */
    maxConsecutive?: number;
    /**
     * The far backstop: unusable decisions in a row that end the loop however
     * much their issues differ. At least the no-progress guard and at most
     * `maxIterations`; absent,
     * `AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_UNUSABLE_DECISIONS_IN_A_ROW`
     * held to those two.
     */
    maxInARow?: number;
    stalled(input: {
      issueCodes: readonly string[];
      trace: readonly AutomationStudioLlmEvidenceLoopTrace[];
      accounting: Readonly<AutomationStudioLlmEvidenceLoopAccounting>;
    }): unknown;
  };
  /**
   * Check a completed result before the loop accepts it.
   *
   * A result the check refuses was a paid call that produced nothing usable.
   * With `unusableDecisions` set it is recorded as an `unusable` step, the
   * check's feedback is added to the evidence the model sees under
   * `AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID`, and the loop
   * asks again; without it, the loop ends `llm_evidence_loop.invalid_decision`.
   * A check that throws is a decision error. Its issue codes are what decide
   * whether the refusal is new: the feedback should name each issue and the
   * shape that is accepted, since it is all the model has to correct from.
   */
  checkCompletion?(result: JsonObject): AutomationStudioLlmEvidenceCompletionCheck | Promise<AutomationStudioLlmEvidenceCompletionCheck>;
  /**
   * What a tool call that throws, or returns what is not a result, does.
   *
   * `observe`: it is a step without progress, recorded in the trace under its
   * call id with a closed code, and shown to the model as that call's result
   * (`tool-failure.ts`); the loop asks again, and a run of them reaching the
   * no-progress guard ends it `llm_evidence_loop.tool_failed`. It is not
   * evidence toward `minToolCalls`, and an action that failed counts as a
   * change, since it may have changed what a look would see. `end`: the loop
   * ends `llm_evidence_loop.tool_failed` at once and records nothing.
   *
   * Absent, `observe` when `unusableDecisions` is set -- a loop that asks
   * again after a decision it could not use asks again after a call that
   * failed -- otherwise `end`. Cancellation ends the loop either way.
   */
  toolFailures?: "observe" | "end";
  /**
   * A digest of the whole state, taken either side of each action.
   *
   * What it buys is the reduction (`runtime/exploration-reduction/`), which
   * needs a digest chain to say which steps the end state depended on. It
   * costs a round trip per call, so it is the caller's decision. Answering
   * with nothing leaves that step without digests and is not a failure; a hook
   * that throws is taken as the call having failed, and the step is recorded
   * as one, because a step with a digest the caller could not take is a step
   * nothing knows the shape of.
   */
  captureStateDigest?(input: { callId: string; toolId: string; signal?: AbortSignal }): Promise<string | undefined> | string | undefined;
  /**
   * The draft the loop accrues and shows the model beside its evidence
   * (`runtime/flow-draft/`), with `amend_draft` decisions to correct it.
   * `false` turns both off; `steps` is returned either way. `maxBytes` is what
   * the entry may cost, absent a quarter of the evidence context up to 4,000;
   * `maxAmendments` is how many edits the run may spend, absent four.
   */
  draft?: false | { maxBytes?: number; maxAmendments?: number };
  signal?: AbortSignal;
};

/**
 * Coordinates an allowlisted, bounded evidence-gathering loop. Provider grants,
 * request budgets, and final artifact validation remain authoritative in the
 * callbacks that already own those responsibilities.
 */
export async function runAutomationStudioLlmEvidenceLoop(
  input: AutomationStudioLlmEvidenceLoopInput
): Promise<AutomationStudioLlmEvidenceLoopResult> {
  const limits = resolveLimits(input);
  const trace: AutomationStudioLlmEvidenceLoopTrace[] = [];
  // The draft (`runtime/flow-draft/`): every action appended as it happens, so
  // a result is written from what the loop did rather than from what is still
  // in front of the model. Kept whether or not it is shown.
  const draftSteps: AutomationStudioFlowDraftStep[] = [];
  const drafting = input.draft !== false;
  let draftAmendments = 0;
  const draftRecord = (step: Omit<AutomationStudioFlowDraftStep, "position" | "disposition">): void => {
    draftSteps.push({ ...step, position: draftSteps.length + 1, disposition: "kept" });
  };
  // A digest of the whole state, when the caller offered to take one. It is
  // taken inside the same attempt as the call it brackets, so a hook that
  // throws makes the step a recorded failure the model and the reader can both
  // see, rather than a step that quietly has no digests.
  const digest = async (callId: string, toolId: string): Promise<string | undefined> =>
    input.captureStateDigest ? input.captureStateDigest({ callId, toolId, ...(input.signal ? { signal: input.signal } : {}) }) : undefined;
  const accounting = emptyAccounting();
  if (!limits || !automationStudioLlmEvidenceValidTools(input.tools)) return failure(draftSteps, "llm_evidence_loop.invalid_configuration", trace, accounting);
  const toolIds = new Set(input.tools.map((tool) => tool.toolId));
  const toolsById = new Map(input.tools.map((tool) => [tool.toolId, tool] as const));
  // Whether any mutation is reachable at all. Read once, because the offered
  // list does not change during a loop, and because it is what decides whether
  // a mutation-gated observation is gated or simply shut (see
  // `repeat-policy.ts`).
  const mutableTools = input.tools.some((tool) => tool.effect === "mutate");
  const callIds = new Set<string>();
  // Each request that ran, by what it asked in which epoch, and the call that
  // answered it (`repeat-policy.ts` says which epoch).
  const answeredRequests = new Map<string, string>();
  const observationEpochs = new Map<string, number>();
  // The call that made each protected tool's latest observation.
  const latestObservations = new Map<string, string>();
  // What has changed, and what has happened: two counters, and `repeat-policy.ts`
  // says which question each of them answers.
  let mutationEpoch = 0;
  let attemptEpoch = 0;
  // Everything gathered, whatever its size: each decision is shown a window of
  // it (`context-window.ts`), and only the total is held to the
  // backstop.
  const evidence: AutomationStudioLlmEvidenceRecord[] = [];
  const observeToolFailures = (input.toolFailures ?? (input.unusableDecisions ? "observe" : "end")) === "observe";
  // Calls that failed: counted as calls, never as evidence toward `minToolCalls`.
  let failedToolCalls = 0;
  // The no-progress guard: steps in a row that gave the loop nothing new, and
  // the unusable issue sets seen since the last tool result.
  let stepsWithoutProgress = 0;
  const unusableIssueSets = new Set<string>();
  // The far backstop: unusable decisions in a row, however they differ, and the latest one's issues.
  let unusableInARow = 0;
  let lastIssueCodes: readonly string[] = [];
  // What the last decision was shown, and what was brought back into view since
  // the last tool result: asking once for a result that had left the window is
  // how the model sees it again, so only a second ask, or one for a result it
  // could see, is a step without progress.
  let lastShown = new Set<string>();
  const broughtBack = new Set<string>();
  // The budget's clock and the decisions whose usage it could count.
  const clock = input.budget?.now ?? Date.now;
  const startedAtMs = clock();
  let reportedDecisions = 0;
  let finalDecision = false;
  const progressed = (): void => {
    stepsWithoutProgress = 0;
    unusableIssueSets.clear();
    broughtBack.clear();
  };
  // Counts evidence the loop itself adds against the byte limit. Returns its
  // bytes, or nothing when it does not fit.
  const reserveEvidence = (value: JsonValue): number | undefined => {
    const bytes = Buffer.byteLength(JSON.stringify(value), "utf8");
    if (accounting.evidenceBytes + bytes > limits.maxEvidenceBytes) return undefined;
    accounting.evidenceBytes += bytes;
    return bytes;
  };
  // One more unusable decision. Returns the error that ends the loop once a
  // guard is reached, or nothing when the loop should ask again.
  const unusable = (step: AutomationStudioLlmEvidenceLoopTrace, issueCodes: readonly string[]): { error: unknown } | undefined => {
    unusableInARow += 1;
    lastIssueCodes = issueCodes;
    const issueSet = automationStudioLlmUnusableDecisionIssueSet(issueCodes);
    if (unusableIssueSets.has(issueSet)) stepsWithoutProgress += 1;
    else {
      unusableIssueSets.add(issueSet);
      stepsWithoutProgress = 1;
    }
    trace.push(step);
    if (stepsWithoutProgress < limits.maxStepsWithoutProgress && unusableInARow < limits.maxUnusableDecisionsInARow) return undefined;
    return { error: input.unusableDecisions!.stalled({ issueCodes, trace: [...trace], accounting: { ...accounting } }) };
  };
  // A call that threw or returned what is not a result: recorded and shown to
  // the model under its own call id when failures are observed. Returns the
  // result that ends the loop, or nothing when it should ask again.
  const toolFailed = (iteration: number, callId: string, tool: AutomationStudioLlmEvidenceTool, code: AutomationStudioLlmEvidenceToolFailureCode, value: JsonObject, usage?: AutomationStudioLlmUsageSummary, stateBefore?: string): AutomationStudioLlmEvidenceLoopResult | undefined => {
    // A failed action is part of the record: a live campaign's largest single
    // defect was a failed call that ended a build and left no trace of itself.
    draftRecord({ iteration, callId, actionId: tool.toolId, input: value, effect: tool.effect ?? "observe", effectApplied: false, resultCode: code, ...(stateBefore ? { stateBefore, stateAfter: stateBefore } : {}) });
    if (input.signal?.aborted) return failure(draftSteps, "llm_evidence_loop.cancelled", trace, accounting);
    if (!observeToolFailures) return failure(draftSteps, "llm_evidence_loop.tool_failed", trace, accounting);
    accounting.toolCalls += 1;
    failedToolCalls += 1;
    stepsWithoutProgress += 1;
    if (tool.effect === "mutate") { mutationEpoch += 1; attemptEpoch += 1; }
    const step: AutomationStudioLlmEvidenceLoopTrace = { iteration, decision: "tool_call", callId, toolId: tool.toolId, resultCode: code, ...(usage ? { usage } : {}) };
    if (stepsWithoutProgress >= limits.maxStepsWithoutProgress) {
      trace.push(step);
      return failure(draftSteps, "llm_evidence_loop.tool_failed", trace, accounting);
    }
    const record = automationStudioLlmEvidenceToolFailure({ code, toolId: tool.toolId, stepsWithoutProgress, maxStepsWithoutProgress: limits.maxStepsWithoutProgress });
    const recordBytes = reserveEvidence(record);
    trace.push(recordBytes === undefined ? step : { ...step, evidenceBytes: recordBytes });
    if (recordBytes === undefined) return failure(draftSteps, "llm_evidence_loop.evidence_limit", trace, accounting);
    evidence.push({ callId, toolId: tool.toolId, value: record, call: { resultCode: code, changed: tool.effect === "mutate" ? "unknown" : "no" } });
    return undefined;
  };
  // A request the loop answers itself: the tool is not run, the result that
  // already answers it is moved to the end of the evidence, where the model's
  // window always reaches, and a note naming it follows. Returns the result
  // that ends the loop, or nothing when it should ask again.
  const answerRequest = (
    iteration: number,
    decision: Extract<AutomationStudioLlmEvidenceLoopDecision, { kind: "tool_call" }>,
    code: AnsweredRequestCode,
    answeredByCallId: string
  ): AutomationStudioLlmEvidenceLoopResult | undefined => {
    if (lastShown.has(answeredByCallId) || broughtBack.has(answeredByCallId)) stepsWithoutProgress += 1;
    else broughtBack.add(answeredByCallId);
    const step: AutomationStudioLlmEvidenceLoopTrace = { iteration, decision: "tool_call", toolId: decision.toolId, resultCode: code, ...(decision.usage ? { usage: decision.usage } : {}) };
    if (stepsWithoutProgress >= limits.maxStepsWithoutProgress) {
      trace.push({ ...step, resultCode: "llm_evidence_loop.rejected.repeat_without_progress" });
      return failure(draftSteps, "llm_evidence_loop.repeat_without_progress", trace, accounting);
    }
    const note: JsonObject = {
      ok: false,
      code,
      toolId: decision.toolId,
      answeredByCallId,
      stepsWithoutProgress,
      maxStepsWithoutProgress: limits.maxStepsWithoutProgress,
      instruction: ANSWERED_REQUEST[code]
    };
    const answeredTool = toolsById.get(decision.toolId);
    draftRecord({ iteration, actionId: decision.toolId, input: decision.input, effect: answeredTool?.effect ?? "observe", effectApplied: false, resultCode: code });
    const noteBytes = reserveEvidence(note);
    if (noteBytes === undefined) {
      trace.push(step);
      return failure(draftSteps, "llm_evidence_loop.evidence_limit", trace, accounting);
    }
    const earlier = evidence.findIndex((entry) => entry.callId === answeredByCallId);
    if (earlier >= 0) evidence.push(...evidence.splice(earlier, 1));
    evidence.push({ callId: `${REQUEST_CHECK_TOOL_ID}.${iteration}`, toolId: REQUEST_CHECK_TOOL_ID, value: note });
    trace.push({ ...step, evidenceBytes: noteBytes });
    return undefined;
  };
  const initialTool = input.tools.find((tool) => tool.initialObservation);
  if (initialTool) {
    const initialInput = initialTool.initialObservation!.input;
    if (input.signal?.aborted) return failure(draftSteps, "llm_evidence_loop.cancelled", trace, accounting);
    const callId = `initial.${initialTool.toolId}`;
    callIds.add(callId);
    let execution: ReturnType<typeof automationStudioLlmEvidenceParseToolExecutionResult> | "threw";
    try {
      execution = automationStudioLlmEvidenceParseToolExecutionResult(await input.executeTool({ callId, toolId: initialTool.toolId, value: structuredClone(initialInput), maxEvidenceBytes: limits.toolEvidenceBytes, ...(input.signal ? { signal: input.signal } : {}) }), initialTool.effect);
    } catch {
      execution = "threw";
    }
    if (execution === "threw" || !execution) {
      // Recorded like any failed call; the observation, never made, stays offered.
      const ended = toolFailed(0, callId, initialTool, execution ? "llm_evidence_loop.tool_failed" : "llm_evidence_loop.tool_result_invalid", initialInput);
      if (ended) return ended;
    } else {
      const evidenceBytes = Buffer.byteLength(JSON.stringify(execution.evidence), "utf8");
      if (evidenceBytes > limits.maxEvidenceBytes) return failure(draftSteps, "llm_evidence_loop.evidence_limit", trace, accounting);
      accounting.toolCalls = 1;
      accounting.evidenceBytes = evidenceBytes;
      answeredRequests.set(automationStudioLlmEvidenceCanonicalJson([mutationEpoch, initialTool.toolId, initialInput]), callId);
      observationEpochs.set(initialTool.toolId, attemptEpoch);
      latestObservations.set(initialTool.toolId, callId);
      evidence.push({ callId, toolId: initialTool.toolId, value: execution.evidence, call: { resultCode: execution.resultCode ?? "ok", changed: "no" } });
      trace.push({ iteration: 0, decision: "tool_call", callId, toolId: initialTool.toolId, evidenceBytes, ...(execution.resultCode ? { resultCode: execution.resultCode } : {}) });
      draftRecord({ iteration: 0, callId, actionId: initialTool.toolId, input: initialInput, effect: "observe", effectApplied: false, ...(execution.resultCode ? { resultCode: execution.resultCode } : {}) });
    }
  }
  for (let iteration = 1; iteration <= limits.maxIterations; iteration += 1) {
    if (input.signal?.aborted) return failure(draftSteps, "llm_evidence_loop.cancelled", trace, accounting);
    accounting.iterations = iteration;
    let decision: AutomationStudioLlmEvidenceLoopDecision | undefined;
    let canAmend = false;
    const eligibleTools = input.tools.filter((tool) =>
      !automationStudioLlmEvidenceLookNeedsAttempt(tool, mutableTools) || observationEpochs.get(tool.toolId) !== attemptEpoch
    );
    const eligibleToolIds = new Set(eligibleTools.map((tool) => tool.toolId));
    const canComplete = accounting.toolCalls - failedToolCalls >= limits.minToolCalls;
    if (!eligibleTools.length && !canComplete) return failure(draftSteps, "llm_evidence_loop.repeat_without_progress", trace, accounting);
    // What the budget leaves (`loop-budget.ts`): told to the model as
    // the newest entry, and a last decision that is offered only completion.
    const remaining = input.budget && automationStudioLlmEvidenceLoopRemaining(input.budget, {
      decisions: iteration - 1, reportedDecisions, totalTokens: accounting.totalTokens, estimatedCostUsd: accounting.estimatedCostUsd, elapsedMs: clock() - startedAtMs
    }, limits.maxIterations - iteration + 1);
    if (remaining && remaining.decisionsLeft === 0) {
      // Spent straight after an answer that could not be used: that refusal is
      // why there is no result, so the loop ends as it, with its issue codes.
      if (!unusableInARow || !input.unusableDecisions) return failure(draftSteps, "llm_evidence_loop.iteration_limit", trace, accounting);
      const spent = input.unusableDecisions.stalled({ issueCodes: lastIssueCodes, trace: [...trace], accounting: { ...accounting } });
      if (input.propagateDecisionErrors) throw spent;
      return failure(draftSteps, "llm_evidence_loop.invalid_decision", trace, accounting);
    }
    finalDecision = remaining !== undefined && remaining.decisionsLeft === 1 && canComplete;
    const offered = finalDecision ? [] : eligibleTools;
    try {
      canAmend = drafting && !finalDecision && draftAmendments < limits.maxDraftAmendments && draftSteps.some((step) => step.effect === "mutate");
      const decisionSchema = buildAutomationStudioLlmEvidenceLoopDecisionSchema(offered, input.completionSchema, canComplete, canAmend);
      // From the second decision, when there is spending to measure it by; the first only when it is the last.
      const budgetEntry = remaining && (iteration > 1 || finalDecision) ? automationStudioLlmEvidenceBudgetEntry(iteration, remaining) : undefined;
      // The draft sits beside the window, never inside it: the window keeps
      // the newest result per tool, and every action of one kind arrives under
      // one tool id, which is how a live build lost four of five presses.
      const draftEntry = drafting ? automationStudioFlowDraftEntry({ steps: draftSteps, maxBytes: limits.draftBytes }) : undefined;
      const beside = [draftEntry, budgetEntry].filter((entry) => entry !== undefined);
      const besideBytes = beside.reduce((total, entry) => total + Buffer.byteLength(JSON.stringify(entry), "utf8") + 1, 0);
      const window = automationStudioLlmEvidenceContextWindow(evidence, limits.maxEvidenceContextBytes - besideBytes, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxToolCalls - beside.length);
      const shown = [...window, ...beside];
      lastShown = new Set(shown.map((entry) => entry.callId));
      decision = automationStudioLlmEvidenceParseDecision(await input.decide({ iteration, tools: offered, evidence: shown, decisionSchema, canComplete, ...(input.signal ? { signal: input.signal } : {}) }));
    } catch (thrown) {
      if (input.signal?.aborted) return failure(draftSteps, "llm_evidence_loop.cancelled", trace, accounting);
      let error = thrown;
      if (input.unusableDecisions && thrown instanceof AutomationStudioLlmUnusableDecisionError) {
        const resultCode = thrown.issueCodes[0];
        const stalled = unusable({ iteration, decision: "unusable", ...(resultCode ? { resultCode } : {}) }, thrown.issueCodes);
        if (!stalled) {
          // The model is told what was wrong, as evidence, before it is asked again.
          const feedback = automationStudioLlmUnusableDecisionFeedback({ issueCodes: thrown.issueCodes, stepsWithoutProgress, maxStepsWithoutProgress: limits.maxStepsWithoutProgress });
          if (reserveEvidence(feedback) === undefined) return failure(draftSteps, "llm_evidence_loop.evidence_limit", trace, accounting);
          evidence.push({ callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID}.${iteration}`, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID, value: feedback });
          continue;
        }
        error = stalled.error;
      }
      if (input.propagateDecisionErrors) throw error;
    }
    if (!decision) return failure(draftSteps, "llm_evidence_loop.invalid_decision", trace, accounting);
    addUsage(accounting, decision.usage);
    if (decision.usage) reportedDecisions += 1;
    if (decision.kind === "complete") {
      if (accounting.toolCalls - failedToolCalls < limits.minToolCalls) return failure(draftSteps, "llm_evidence_loop.invalid_decision", trace, accounting);
      let check: ReturnType<typeof automationStudioLlmEvidenceParseCompletionCheck> = { ok: true };
      if (input.checkCompletion) {
        try {
          check = automationStudioLlmEvidenceParseCompletionCheck(await input.checkCompletion(structuredClone(decision.result)));
        } catch (error) {
          if (input.signal?.aborted) return failure(draftSteps, "llm_evidence_loop.cancelled", trace, accounting);
          if (input.propagateDecisionErrors) throw error;
          return failure(draftSteps, "llm_evidence_loop.invalid_decision", trace, accounting);
        }
      }
      if (check?.ok) {
        trace.push({ iteration, decision: "complete", ...(decision.usage ? { usage: decision.usage } : {}) });
        return { ok: true, result: decision.result, trace, steps: draftSteps, accounting };
      }
      if (!check || !input.unusableDecisions) return failure(draftSteps, "llm_evidence_loop.invalid_decision", trace, accounting);
      // The model is told why, as evidence, before it is asked again.
      if (reserveEvidence(check.feedback) === undefined) return failure(draftSteps, "llm_evidence_loop.evidence_limit", trace, accounting);
      evidence.push({ callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID}.${iteration}`, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID, value: check.feedback });
      const resultCode = check.issueCodes[0];
      const stalled = unusable({ iteration, decision: "unusable", ...(resultCode ? { resultCode } : {}), ...(decision.usage ? { usage: decision.usage } : {}) }, check.issueCodes);
      if (!stalled) continue;
      if (input.propagateDecisionErrors) throw stalled.error;
      return failure(draftSteps, "llm_evidence_loop.invalid_decision", trace, accounting);
    }
    if (decision.kind === "amend_draft") {
      // Acting on an edit the model was not offered would let a draft be
      // edited after the allowance for editing it had run out.
      if (!canAmend) return failure(draftSteps, "llm_evidence_loop.invalid_decision", trace, accounting);
      draftAmendments += 1;
      unusableInARow = 0;
      const amended = applyAutomationStudioFlowDraftAmendments(draftSteps, decision.amendments);
      trace.push({ iteration, decision: "amend_draft", resultCode: amended.applied ? "llm_evidence_loop.draft_amended" : "llm_evidence_loop.draft_unchanged", ...(decision.usage ? { usage: decision.usage } : {}) });
      // An edit is progress on the draft and never on the evidence, so an edit
      // that landed neither clears the no-progress guard nor is spent by it.
      // Clearing it was the first thing tried, and a live build alternated a
      // repeated request with an edit until the reset had laundered every
      // repeat: the guard never tripped and the build ran to its iteration
      // limit having gathered nothing new since its eleventh call. An edit that
      // changed nothing does count, because that guard is the only thing that
      // stops a model editing one step forever.
      if (!amended.applied && (stepsWithoutProgress += 1) >= limits.maxStepsWithoutProgress) {
        return failure(draftSteps, "llm_evidence_loop.repeat_without_progress", trace, accounting);
      }
      continue;
    }
    unusableInARow = 0;
    // The last decision the budget allowed was offered only completion.
    if (finalDecision) return failure(draftSteps, "llm_evidence_loop.iteration_limit", trace, accounting);
    if (!toolIds.has(decision.toolId)) return failure(draftSteps, "llm_evidence_loop.unknown_tool", trace, accounting);
    // A repeat is answered from what the loop already holds. Checked before the
    // call id, so a request repeated word for word is a repeat, not a clash.
    const tool = toolsById.get(decision.toolId)!;
    const toolRequestSignature = automationStudioLlmEvidenceRequestSignature({ tool, mutationEpoch, attemptEpoch, input: decision.input });
    const answeredBy = answeredRequests.get(toolRequestSignature);
    // Not offered this iteration: an observation nothing has happened since.
    // Its latest call is always recorded with its epoch.
    const reobservation = !eligibleToolIds.has(decision.toolId);
    if (answeredBy !== undefined || reobservation) {
      const ended = answeredBy !== undefined
        ? answerRequest(iteration, decision, "llm_evidence_loop.already_answered", answeredBy)
        : answerRequest(iteration, decision, "llm_evidence_loop.already_observed", latestObservations.get(decision.toolId)!);
      if (ended) return ended;
      continue;
    }
    // A call id the model already used names a different request here, so the
    // loop gives it one of its own rather than ending: the ids are the model's
    // bookkeeping, and the evidence only needs them to be distinct.
    const callId = unusedCallId(callIds, decision.callId);
    if (accounting.toolCalls >= limits.maxToolCalls) return failure(draftSteps, "llm_evidence_loop.iteration_limit", trace, accounting);
    callIds.add(callId);
    answeredRequests.set(toolRequestSignature, callId);
    let execution: ReturnType<typeof automationStudioLlmEvidenceParseToolExecutionResult> | "threw";
    let stateBefore: string | undefined;
    let stateAfter: string | undefined;
    try {
      stateBefore = await digest(callId, decision.toolId);
      const ran = await input.executeTool({ callId, toolId: decision.toolId, value: decision.input, maxEvidenceBytes: limits.toolEvidenceBytes, ...(input.signal ? { signal: input.signal } : {}) });
      stateAfter = await digest(callId, decision.toolId);
      execution = automationStudioLlmEvidenceParseToolExecutionResult(ran, tool.effect);
    } catch {
      execution = "threw";
    }
    if (execution === "threw" || !execution) {
      // Nothing answered the request, so asking it again is not a repeat.
      answeredRequests.delete(toolRequestSignature);
      const ended = toolFailed(iteration, callId, tool, execution ? "llm_evidence_loop.tool_failed" : "llm_evidence_loop.tool_result_invalid", decision.input, decision.usage, stateBefore);
      if (ended) return ended;
      continue;
    }
    const { evidence: value, effectApplied, resultCode } = execution;
    const evidenceBytes = Buffer.byteLength(JSON.stringify(value), "utf8");
    if (accounting.evidenceBytes + evidenceBytes > limits.maxEvidenceBytes) return failure(draftSteps, "llm_evidence_loop.evidence_limit", trace, accounting);
    accounting.toolCalls += 1;
    accounting.evidenceBytes += evidenceBytes;
    progressed();
    if (tool.effect === "mutate") { attemptEpoch += 1; if (effectApplied) mutationEpoch += 1; }
    if (automationStudioLlmEvidenceLookNeedsAttempt(tool, mutableTools)) {
      observationEpochs.set(tool.toolId, attemptEpoch);
      latestObservations.set(tool.toolId, callId);
    }
    evidence.push({ callId, toolId: decision.toolId, value, call: { resultCode: resultCode ?? "ok", changed: tool.effect === "mutate" && effectApplied ? "yes" : "no" } });
    trace.push({ iteration, decision: "tool_call", callId, toolId: decision.toolId, evidenceBytes, ...(tool.effect === "mutate" ? { effectApplied } : {}), ...(resultCode ? { resultCode } : {}), ...(decision.usage ? { usage: decision.usage } : {}) });
    draftRecord({ iteration, callId, actionId: decision.toolId, input: decision.input, effect: tool.effect ?? "observe", effectApplied, ...(resultCode ? { resultCode } : {}), ...(stateBefore !== undefined && stateAfter !== undefined ? { stateBefore, stateAfter } : {}) });
  }
  return failure(draftSteps, "llm_evidence_loop.iteration_limit", trace, accounting);
}

/**
 * The requested call id when it is unused, otherwise the first of `<id>.2`,
 * `<id>.3`, ... that is, cut to keep within the 200-character id bound. The
 * suffix is digits and a dot, so the id stays one the provider schema accepts.
 */
function unusedCallId(used: ReadonlySet<string>, requested: string): string {
  if (!used.has(requested)) return requested;
  for (let suffix = 2; ; suffix += 1) {
    const tail = `.${suffix}`;
    const candidate = `${requested.slice(0, 200 - tail.length)}${tail}`;
    if (!used.has(candidate)) return candidate;
  }
}

type EvidenceLoopLimits = {
  maxIterations: number;
  maxToolCalls: number;
  maxEvidenceBytes: number;
  maxEvidenceContextBytes: number;
  /** What each tool call is offered: the context window less room for what sits beside it. */
  toolEvidenceBytes: number;
  minToolCalls: number;
  maxStepsWithoutProgress: number;
  maxUnusableDecisionsInARow: number;
  /** What the draft entry beside the window may cost. */
  draftBytes: number;
  /** Amendment decisions the run may spend before the kind is withdrawn. */
  maxDraftAmendments: number;
};

function resolveLimits(input: AutomationStudioLlmEvidenceLoopInput): EvidenceLoopLimits | undefined {
  const maxEvidenceBytes = input.maxEvidenceBytes ?? AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxEvidenceBytes;
  const maxEvidenceContextBytes = input.maxEvidenceContextBytes ?? Math.min(64_000, maxEvidenceBytes);
  const maxIterations = input.maxIterations ?? 8;
  const unusable = input.unusableDecisions;
  const draft = input.draft === false ? undefined : input.draft;
  if (input.maxStepsWithoutProgress !== undefined && unusable?.maxConsecutive !== undefined
    && input.maxStepsWithoutProgress !== unusable.maxConsecutive) return undefined;
  const maxStepsWithoutProgress = input.maxStepsWithoutProgress ?? unusable?.maxConsecutive
    ?? Math.min(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_MAX_CONSECUTIVE_UNUSABLE_DECISIONS, maxIterations);
  const limits: EvidenceLoopLimits = {
    maxIterations,
    maxToolCalls: input.maxToolCalls ?? 8,
    maxEvidenceBytes,
    maxEvidenceContextBytes,
    toolEvidenceBytes: Math.max(1, maxEvidenceContextBytes - 512),
    minToolCalls: input.minToolCalls ?? 0,
    maxStepsWithoutProgress,
    maxUnusableDecisionsInARow: unusable?.maxInARow
      ?? Math.max(maxStepsWithoutProgress, Math.min(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_UNUSABLE_DECISIONS_IN_A_ROW, maxIterations)),
    // A quarter of what a decision carries, capped: enough for a few dozen
    // steps without their arguments, and never enough to displace a result.
    draftBytes: draft?.maxBytes ?? Math.min(4_000, Math.floor(maxEvidenceContextBytes / 4)),
    maxDraftAmendments: Math.min(draft?.maxAmendments ?? 4, maxIterations)
  };
  if (!Number.isInteger(limits.maxStepsWithoutProgress) || limits.maxStepsWithoutProgress < 1 || limits.maxStepsWithoutProgress > maxIterations) return undefined;
  if (unusable && (typeof unusable.stalled !== "function"
    || !Number.isInteger(limits.maxUnusableDecisionsInARow) || limits.maxUnusableDecisionsInARow < limits.maxStepsWithoutProgress
    || limits.maxUnusableDecisionsInARow > maxIterations)) return undefined;
  if (!Number.isInteger(limits.maxIterations) || limits.maxIterations <= 0 || limits.maxIterations > AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxIterations) return undefined;
  if (!Number.isInteger(limits.maxToolCalls) || limits.maxToolCalls <= 0 || limits.maxToolCalls > AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxToolCalls) return undefined;
  if (!Number.isInteger(limits.maxEvidenceBytes) || limits.maxEvidenceBytes <= 0 || limits.maxEvidenceBytes > AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxEvidenceBytes) return undefined;
  if (!Number.isInteger(limits.maxEvidenceContextBytes) || limits.maxEvidenceContextBytes < 1_024 || limits.maxEvidenceContextBytes > limits.maxEvidenceBytes
    || limits.maxEvidenceContextBytes > automationStudioLlmTokenBudgetBytes(AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST)) return undefined;
  if (input.budget && !automationStudioLlmEvidenceLoopBudgetValid(input.budget)) return undefined;
  if (!Number.isInteger(limits.minToolCalls) || limits.minToolCalls < 0 || limits.minToolCalls > limits.maxToolCalls || limits.minToolCalls >= limits.maxIterations) return undefined;
  if (!Number.isInteger(limits.draftBytes) || limits.draftBytes < 0 || limits.draftBytes >= limits.maxEvidenceContextBytes) return undefined;
  if (!Number.isInteger(limits.maxDraftAmendments) || limits.maxDraftAmendments < 0 || limits.maxDraftAmendments > limits.maxIterations) return undefined;
  return limits;
}

/**
 * A check's answer, or `undefined` when it is not one. Issue codes are kept
 * only when they are codes; feedback only when it is bounded JSON.
 */
function failure(steps: AutomationStudioFlowDraftStep[], code: AutomationStudioLlmEvidenceLoopFailureCode, trace: AutomationStudioLlmEvidenceLoopTrace[], accounting: AutomationStudioLlmEvidenceLoopAccounting): AutomationStudioLlmEvidenceLoopResult {
  return { ok: false, code, trace, steps, accounting };
}

function emptyAccounting(): AutomationStudioLlmEvidenceLoopAccounting {
  return { iterations: 0, toolCalls: 0, evidenceBytes: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 };
}

function addUsage(accounting: AutomationStudioLlmEvidenceLoopAccounting, usage?: AutomationStudioLlmUsageSummary): void {
  if (!usage) return;
  accounting.inputTokens += usage.inputTokens ?? 0;
  accounting.outputTokens += usage.outputTokens ?? 0;
  accounting.totalTokens += usage.totalTokens ?? ((usage.inputTokens ?? 0) + (usage.outputTokens ?? 0));
  accounting.estimatedCostUsd += usage.estimatedCostUsd ?? 0;
}
