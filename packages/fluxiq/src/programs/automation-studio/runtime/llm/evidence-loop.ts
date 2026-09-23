import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS } from "../loop-limits/index.ts";
import {
  applyAutomationStudioFlowDraftAmendments,
  automationStudioFlowDraftEntry,
  automationStudioFlowDraftStepIsProposable,
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
// What a loop may be configured with, and how those numbers resolve
// (`loop-configuration.ts`). Re-exported below, so the loop's public
// surface is unchanged.
import { resolveLimits, type AutomationStudioLlmEvidenceLoopInput } from "./loop-configuration.ts";
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
/** What a loop may be configured with, in `loop-configuration.ts` with the arithmetic that reads it. */
export type { AutomationStudioLlmEvidenceLoopInput } from "./loop-configuration.ts";
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

/** The far backstop on steps in a row that give the loop nothing new, held in
 * `runtime/loop-limits/` with the other numbers two directories read, and
 * re-exported here so the loop's public surface names it. */
export { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS };

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
  /**
   * Whether each call of this tool says for itself what it did, rather than the
   * tool saying once for all of them.
   *
   * One tool that runs whichever of a library's things the call names cannot
   * declare an effect up front: the same tool reads a page on one call and
   * changes it on the next, and which it was is known only once it has run. So
   * its result carries `draft` (below) and the loop reads the effect, the name
   * and whether the result should contain it from there. `effect` still says
   * what the *worst* such a call may do, which is what the offering gate reads.
   *
   * Two consequences. Repeats are keyed on the looser of the two epochs, since
   * the loop cannot know before the call which one applies. And the tool may
   * carry an `initialObservation` although it is declared `mutate`, because the
   * caller -- not the model -- writes that one call's argument and is
   * responsible for it being a look.
   */
  perCallEffect?: boolean;
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
  /**
   * What this one call did, for the draft the loop is accruing.
   *
   * A tool that runs whichever of a library's things the call named answers
   * here: which thing (`actionId`), what it ran with (`input`), whether it read
   * or changed (`effect`), and whether a result should contain it
   * (`proposes`) -- `false` for a call that failed or that belongs in no
   * result. Core reads none of it: the name is opaque, the argument is carried
   * so the step can be written down or run again, and the two flags are the
   * caller's statement about its own call.
   *
   * Absent, the tool's own declaration stands, which is what every tool that
   * does one thing has always relied on.
   */
  draft?: {
    actionId?: string;
    input?: JsonObject;
    /** What the call really ran with, where that differs from what was written. */
    ranWith?: JsonObject;
    effect?: "observe" | "mutate";
    proposes?: boolean;
  };
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
  /**
   * What one call did, as the caller reported it, over what its tool declared.
   *
   * A tool that runs whichever of a library's things the call names is the
   * reason this exists: the effect, the name and whether the result should
   * contain it are properties of the call, not of the tool.
   */
  const callRecord = (
    tool: AutomationStudioLlmEvidenceTool,
    input: JsonObject,
    execution?: { draft?: AutomationStudioLlmEvidenceToolExecutionResult["draft"] }
  ): { actionId: string; toolId?: string; input: JsonObject; ranWith?: JsonObject; effect: "observe" | "mutate"; proposes?: boolean } => {
    const declared = execution?.draft;
    const actionId = declared?.actionId ?? tool.toolId;
    return {
      actionId,
      ...(actionId === tool.toolId ? {} : { toolId: tool.toolId }),
      input: declared?.input ?? input,
      ...(declared?.ranWith === undefined ? {} : { ranWith: declared.ranWith }),
      effect: declared?.effect ?? tool.effect ?? "observe",
      ...(declared?.proposes === undefined ? {} : { proposes: declared.proposes })
    };
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
  const mutableTools = input.tools.some((tool) => tool.effect === "mutate" || tool.perCallEffect === true);
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
    // `effectApplied: false` is what says it did not happen. Saying it is not
    // an action at all would take it off the draft the model is shown, and an
    // action that was attempted and failed is part of the record of what was done.
    draftRecord({ iteration, callId, ...callRecord(tool, value), effectApplied: false, resultCode: code, ...(stateBefore ? { stateBefore, stateAfter: stateBefore } : {}) });
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
    draftRecord({ iteration, actionId: decision.toolId, input: decision.input, effect: answeredTool?.effect ?? "observe", effectApplied: false, proposes: false, resultCode: code });
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
      draftRecord({ iteration: 0, callId, ...callRecord(initialTool, initialInput, execution), effect: "observe", effectApplied: false, ...(execution.resultCode ? { resultCode: execution.resultCode } : {}) });
    }
  }
  for (let iteration = 1; iteration <= limits.maxIterations; iteration += 1) {
    if (input.signal?.aborted) return failure(draftSteps, "llm_evidence_loop.cancelled", trace, accounting);
    accounting.iterations = iteration;
    let decision: AutomationStudioLlmEvidenceLoopDecision | undefined;
    let canAmend = false;
    // Whether this iteration's call is a step the model asked to run again,
    // which is never a repeat however identical it looks.
    let rerunning = false;
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
      canAmend = drafting && !finalDecision && draftAmendments < limits.maxDraftAmendments && draftSteps.some(automationStudioFlowDraftStepIsProposable);
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
          check = automationStudioLlmEvidenceParseCompletionCheck(await input.checkCompletion(structuredClone(decision.result), { steps: draftSteps.map((step) => ({ ...step })) }));
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
      // One amendment cannot be carried out here, because it has to run
      // something: `rerun` replaces a step by doing it again with a corrected
      // argument. The step it replaces is withdrawn, and the call that follows
      // goes through exactly the path an ordinary tool call goes through, so a
      // corrected step is recorded, digested and checked like any other.
      const rerun = rerunRequest(decision.amendments, draftSteps, toolIds);
      const amended = applyAutomationStudioFlowDraftAmendments(draftSteps, decision.amendments.filter((amendment) => amendment.change !== "rerun"));
      if (rerun) applyAutomationStudioFlowDraftAmendments(draftSteps, [{ step: rerun.step, change: "drop" }]);
      trace.push({ iteration, decision: "amend_draft", resultCode: rerun ? "llm_evidence_loop.draft_rerun" : amended.applied ? "llm_evidence_loop.draft_amended" : "llm_evidence_loop.draft_unchanged", ...(decision.usage ? { usage: decision.usage } : {}) });
      // An edit is progress on the draft and never on the evidence, so an edit
      // that landed neither clears the no-progress guard nor is spent by it.
      // Clearing it was the first thing tried, and a live build alternated a
      // repeated request with an edit until the reset had laundered every
      // repeat: the guard never tripped and the build ran to its iteration
      // limit having gathered nothing new since its eleventh call. An edit that
      // changed nothing does count, because that guard is the only thing that
      // stops a model editing one step forever.
      if (!rerun && !amended.applied && (stepsWithoutProgress += 1) >= limits.maxStepsWithoutProgress) {
        return failure(draftSteps, "llm_evidence_loop.repeat_without_progress", trace, accounting);
      }
      if (!rerun) continue;
      // From here the rerun is an ordinary call -- the same budget, the same
      // digests, the same draft entry -- with one exception, below: it is not a
      // repeat. The model has just said to do this again, and answering it from
      // the result already held is how a live build spent seven decisions
      // asking for the same rerun and getting `already_answered` each time
      // (`run-mud9rpmz-16de647b`).
      rerunning = true;
      decision = { kind: "tool_call", callId: rerun.callId, toolId: rerun.toolId, input: rerun.input };
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
    if (!rerunning && (answeredBy !== undefined || reobservation)) {
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
    const record = callRecord(tool, decision.input, execution);
    if (record.effect === "mutate") { attemptEpoch += 1; if (effectApplied) mutationEpoch += 1; }
    if (automationStudioLlmEvidenceLookNeedsAttempt(tool, mutableTools)) {
      observationEpochs.set(tool.toolId, attemptEpoch);
      latestObservations.set(tool.toolId, callId);
    }
    evidence.push({ callId, toolId: decision.toolId, value, call: { resultCode: resultCode ?? "ok", changed: record.effect === "mutate" && effectApplied ? "yes" : "no" } });
    trace.push({ iteration, decision: "tool_call", callId, toolId: decision.toolId, evidenceBytes, ...(record.effect === "mutate" ? { effectApplied } : {}), ...(resultCode ? { resultCode } : {}), ...(decision.usage ? { usage: decision.usage } : {}) });
    draftRecord({ iteration, callId, ...record, effectApplied, ...(resultCode ? { resultCode } : {}), ...(stateBefore !== undefined && stateAfter !== undefined ? { stateBefore, stateAfter } : {}) });
  }
  return failure(draftSteps, "llm_evidence_loop.iteration_limit", trace, accounting);
}

/**
 * The first `rerun` amendment a decision carried that names a step the loop can
 * run again, or nothing.
 *
 * One per decision. Two reruns in one reply would be two calls, and a decision
 * is one call; the rest of the reply's amendments are applied as usual, so
 * nothing is lost by taking the first.
 */
function rerunRequest(
  amendments: readonly AutomationStudioFlowDraftAmendment[],
  steps: readonly AutomationStudioFlowDraftStep[],
  toolIds: ReadonlySet<string>
): { step: number; toolId: string; input: JsonObject; callId: string } | undefined {
  for (const amendment of amendments) {
    if (amendment.change !== "rerun" || !amendment.input) continue;
    const step = steps.find((candidate) => candidate.position === amendment.step);
    if (!step) continue;
    const toolId = step.toolId ?? step.actionId;
    if (!toolIds.has(toolId)) continue;
    return { step: step.position, toolId, input: amendment.input, callId: `rerun.${step.position}` };
  }
  return undefined;
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
