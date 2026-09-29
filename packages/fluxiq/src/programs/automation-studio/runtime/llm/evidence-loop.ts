import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS } from "../loop-limits/index.ts";
import {
  applyAutomationStudioFlowDraftAmendments,
  AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_ISSUE_CODE,
  automationStudioFlowDraftEntry,
  automationStudioFlowDraftStepIsAction,
  automationStudioFlowDraftStepIsProposable,
  type AutomationStudioFlowDraftStep
} from "../flow-draft/index.ts";
// What a refused amendment is, and what the model is told about it
// (`draft-amendment-feedback.ts`): the reason the draft computed for every
// amendment that changed nothing, which this loop used to drop.
import { AUTOMATION_STUDIO_LLM_EVIDENCE_AMENDMENT_FEEDBACK_TOOL_ID, automationStudioLlmEvidenceDraftAmendmentFeedback } from "./draft-amendment-feedback.ts";
// What the loop's contract is made of, and the pieces of the loop that have a
// reason of their own to give (`evidence-loop/`).
//
// The coordinator stays in this file because half the runtime imports it by
// this path; what moved into the directory beside it is everything it was
// holding as well as the loop -- the contract's nouns, the accounting, how a
// clashing call id is resolved, which rerun can be carried out, and what a
// repeated request is told. Every type is re-exported below, so no consumer
// reads a different path than it did before.
import {
  AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID,
  AUTOMATION_STUDIO_LLM_EVIDENCE_NO_PROGRESS_TOOL_ID,
  AUTOMATION_STUDIO_LLM_EVIDENCE_REQUEST_CHECK_TOOL_ID,
  automationStudioLlmEvidenceAnsweredRequestNote,
  automationStudioLlmEvidenceCallDiagnostic as callDiagnostic,
  automationStudioLlmEvidenceCallRecord as callRecord,
  automationStudioLlmEvidenceLoopAddUsage,
  automationStudioLlmEvidenceLoopEmptyAccounting,
  automationStudioLlmEvidenceLoopDraftShown,
  automationStudioLlmEvidenceLoopFailure as failure,
  automationStudioLlmEvidenceNoProgress,
  automationStudioLlmEvidenceRerunRequest,
  automationStudioLlmEvidenceUnusedCallId,
  type AutomationStudioLlmEvidenceAnsweredRequestCode,
  type AutomationStudioLlmEvidenceLoopDecision,
  type AutomationStudioLlmEvidenceLoopExhaustedBound,
  type AutomationStudioLlmEvidenceLoopAnswerability,
  type AutomationStudioLlmEvidenceLoopDraftChange,
  type AutomationStudioLlmEvidenceLoopDraftShown,
  type AutomationStudioLlmEvidenceLoopResult,
  type AutomationStudioLlmEvidenceLoopTrace,
  type AutomationStudioLlmEvidenceLoopProgress,
  type AutomationStudioLlmEvidenceTool
} from "./evidence-loop/index.ts";
import { automationStudioFlowDraftDryRunGate } from "./node-tools/index.ts";
import { automationStudioLlmEvidenceContextWindow, type AutomationStudioLlmEvidenceRecord } from "./context-window.ts";
import {
  automationStudioLlmEvidenceCanonicalJson,
  automationStudioLlmEvidenceParseCompletionCheck,
  automationStudioLlmEvidenceParseDecision,
  automationStudioLlmEvidenceParseToolExecutionResult,
  automationStudioLlmEvidenceValidTools,
  buildAutomationStudioLlmEvidenceLoopDecisionSchema
} from "./evidence-loop-decision.ts";
import { automationStudioLlmEvidenceLookNeedsAttempt, automationStudioLlmEvidenceLookWasRefused, automationStudioLlmEvidenceNothingHappened, automationStudioLlmEvidenceRequestSignature } from "./repeat-policy.ts";
// What a loop may be configured with, and how those numbers resolve
// (`loop-configuration.ts`). Re-exported below, so the loop's public
// surface is unchanged.
import { AUTOMATION_STUDIO_LLM_EVIDENCE_MIN_DRAFT_BYTES, automationStudioLlmEvidenceLoopSeedSteps, resolveLimits, type AutomationStudioLlmEvidenceLoopInput } from "./loop-configuration.ts";
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
/**
 * The floor under a draft's byte budget: what the entry needs to list one step
 * with its argument and still say in full how to correct it. A caller naming
 * `draft.maxBytes` beneath it is refused; see the constant's own note.
 */
export { AUTOMATION_STUDIO_LLM_EVIDENCE_MIN_DRAFT_BYTES } from "./loop-configuration.ts";
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

/**
 * What the loop's contract is, declared one noun per file in `evidence-loop/`
 * and republished here.
 *
 * Every one of these was declared in this file, and the file was 941 lines of
 * the contract and the loop together -- over the 800-line limit, with no
 * baseline entry, which made the centre of the improvement loop the one file
 * nobody was allowed to add a line to. They are re-exported rather than moved
 * away, because a dozen modules across `harness/`, `harness-options/`,
 * `node-tools/`, `deepseek/` and `runtime/recovery/` import them from this
 * path, and the point of the split is that none of them notices it.
 */
export type {
  AutomationStudioLlmEvidenceCompletionCheck,
  AutomationStudioLlmEvidenceLoopAccounting,
  AutomationStudioLlmEvidenceLoopAnswerability,
  AutomationStudioLlmEvidenceLoopDecision,
  AutomationStudioLlmEvidenceLoopDraftChange,
  AutomationStudioLlmEvidenceLoopDraftShown,
  AutomationStudioLlmEvidenceLoopExhaustedBound,
  AutomationStudioLlmEvidenceLoopExhaustion,
  AutomationStudioLlmEvidenceLoopFailureCode,
  AutomationStudioLlmEvidenceLoopResult,
  AutomationStudioLlmEvidenceLoopTrace,
  AutomationStudioLlmEvidenceLoopProgress,
  AutomationStudioLlmEvidenceTool,
  AutomationStudioLlmEvidenceToolExecutionResult
} from "./evidence-loop/index.ts";
/** The evidence entry a refused completion's feedback arrives under. */
export { AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID } from "./evidence-loop/index.ts";


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
  /**
   * One row of the record, stamped with the moment it was recorded.
   *
   * **Every row goes through here, which is the point of it existing.** The
   * stamp was declared downstream and emitted nowhere, so a build's rows
   * carried no moment at all and a reader could only see one undivided gap:
   * `run-mug776kx-0214b287` spent 695 seconds over 41 rows and not one of them
   * said when it happened, so a step that took ten minutes could not be told
   * from forty that took seventeen seconds each. Stamping at the push rather
   * than at each row's construction is what makes "every row has one" a
   * property of the loop instead of a rule someone has to remember at the next
   * push site.
   *
   * `Date.now()` and not the budget's clock: this is a wall-clock moment for a
   * person reading the record afterwards, while `input.budget.now` is an
   * elapsed-time source a caller may drive itself.
   */
  /**
   * What this iteration's decision was shown of the draft, stamped onto every
   * row the iteration records (`./evidence-loop/draft-shown.ts`).
   *
   * Here for the same reason the moment below is: a row that says what the model
   * was looking at is a property of the loop rather than a rule someone has to
   * remember at each of the five push sites. It is cleared at the top of every
   * iteration, so a row carries the draft of the decision it belongs to or
   * nothing at all -- and nothing is the honest answer for the rows recorded
   * before the first decision, which were shown no draft.
   */
  let draftShown: AutomationStudioLlmEvidenceLoopDraftShown | undefined;
  let draftRevision = 0;
  let previousAnswerability: AutomationStudioLlmEvidenceLoopAnswerability | undefined;
  type RowTransition = {
    draftChanged?: boolean;
    pageState?: AutomationStudioLlmEvidenceLoopProgress["pageState"];
    answerability?: AutomationStudioLlmEvidenceLoopAnswerability;
    draftChange?: AutomationStudioLlmEvidenceLoopDraftChange;
  };
  const sameAnswerability = (left: AutomationStudioLlmEvidenceLoopAnswerability, right: AutomationStudioLlmEvidenceLoopAnswerability): boolean =>
    left.recordsRequested === right.recordsRequested
    && left.recordProducerPresent === right.recordProducerPresent
    && left.recordStorePresent === right.recordStorePresent
    && left.issueCode === right.issueCode;
  const recordRow = (row: AutomationStudioLlmEvidenceLoopTrace, transition: RowTransition = {}): void => {
    const draftRevisionBefore = draftRevision;
    if (transition.draftChanged) draftRevision += 1;
    const answerabilityState: AutomationStudioLlmEvidenceLoopProgress["answerabilityState"] = !transition.answerability
      ? "unobserved"
      : !previousAnswerability
        ? "first_observed"
        : sameAnswerability(previousAnswerability, transition.answerability) ? "unchanged" : "changed";
    if (transition.answerability) previousAnswerability = transition.answerability;
    const progress: AutomationStudioLlmEvidenceLoopProgress = {
      draftRevisionBefore,
      draftRevisionAfter: draftRevision,
      pageState: transition.pageState ?? "unobserved",
      draftState: transition.draftChanged ? "changed" : "unchanged",
      answerabilityState
    };
    trace.push({
      ...row,
      ...(draftShown ? { draft: draftShown } : {}),
      progress,
      ...(transition.draftChange ? { draftChange: transition.draftChange } : {}),
      ...(transition.answerability ? { answerability: transition.answerability } : {}),
      at: Date.now()
    });
  };
  // The draft (`runtime/flow-draft/`): every action appended as it happens, so
  // a result is written from what the loop did rather than from what is still
  // in front of the model. Kept whether or not it is shown.
  const draftSteps: AutomationStudioFlowDraftStep[] = automationStudioLlmEvidenceLoopSeedSteps(input.draft);
  const drafting = input.draft !== false;
  let draftAmendments = 0;
  // Steps appended so far, ever, including any since withdrawn: the source of
  // the id below, so no two steps of one build ever share one.
  let draftAppended = draftSteps.reduce((largest, step) => {
    const match = /^d([0-9]+)$/.exec(step.id ?? "");
    return match ? Math.max(largest, Number(match[1])) : largest;
  }, 0);
  const draftRecord = (step: Omit<AutomationStudioFlowDraftStep, "position" | "disposition" | "id">): boolean => {
    draftAppended += 1;
    // The step's own name, which a position stops being the moment the draft is
    // reordered. Routing statements are kept under it (`../flow-draft/routing.ts`).
    const appended: AutomationStudioFlowDraftStep = { ...step, position: draftSteps.length + 1, id: `d${draftAppended}`, disposition: "kept" };
    draftSteps.push(appended);
    return drafting && automationStudioFlowDraftStepIsAction(appended);
  };
  // A digest of the whole state, when the caller offered to take one. It is
  // taken inside the same attempt as the call it brackets, so a hook that
  // throws makes the step a recorded failure the model and the reader can both
  // see, rather than a step that quietly has no digests.
  const digest = async (callId: string, toolId: string): Promise<string | undefined> =>
    input.captureStateDigest ? input.captureStateDigest({ callId, toolId, ...(input.signal ? { signal: input.signal } : {}) }) : undefined;
  const accounting = automationStudioLlmEvidenceLoopEmptyAccounting();
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
  // The far backstop: unusable decisions in a row, however they differ, and the latest one's issues.
  let unusableInARow = 0;
  let lastIssueCodes: readonly string[] = [];
  // Times the model asked to finish, refused or not. A loop that ran out of
  // turns having never tried to finish and one that tried three times and was
  // refused are different builds, and the ending alone cannot tell them apart.
  let completionAttempts = 0;
  // The budget's clock and the decisions whose usage it could count.
  const clock = input.budget?.now ?? Date.now;
  const startedAtMs = clock();
  let reportedDecisions = 0;
  let finalDecision = false;
  // Whether this iteration offered the model the chance to finish. Read by the
  // redirection rather than passed to it: it is pushed from five places, only
  // two of them inside the iteration that worked this out, and telling a model
  // to finish when finishing is not on offer is what that entry must never do.
  let offeredCompletion = false;
  // Everything the loop remembers in order to tell working from repeating, and
  // what it says when the answer is repeating (`./evidence-loop/no-progress.ts`
  // states the whole rule and the run it was measured on). The stop is the last
  // resort: several steps earlier this starts telling the model plainly that it
  // already holds what it keeps asking for, at no cost in calls or iterations.
  const noProgress = automationStudioLlmEvidenceNoProgress({
    max: limits.maxStepsWithoutProgress,
    redirectAt: limits.redirectAtStepsWithoutProgress,
    facts: () => ({
      proposableSteps: draftSteps.filter((step) => step.disposition === "kept" && automationStudioFlowDraftStepIsProposable(step)).length,
      completionAttempts,
      canComplete: offeredCompletion,
      answerability: previousAnswerability
    }),
    // Dropped rather than ending anything when it will not fit.
    show: (iteration: number, note: JsonObject) => {
      if (reserveEvidence(note) === undefined) return;
      evidence.push({ callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_NO_PROGRESS_TOOL_ID}.${iteration}`, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_NO_PROGRESS_TOOL_ID, value: note });
    }
  });
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
  const unusable = (step: AutomationStudioLlmEvidenceLoopTrace, issueCodes: readonly string[], transition?: RowTransition): { error: unknown } | undefined => {
    unusableInARow += 1;
    lastIssueCodes = issueCodes;
    if (transition) noProgress.completionRefused(issueCodes);
    if (noProgress.sameIssuesAgain(automationStudioLlmUnusableDecisionIssueSet(issueCodes))) noProgress.stepped();
    else noProgress.restarted();
    recordRow(step, transition);
    if (!noProgress.reached() && unusableInARow < limits.maxUnusableDecisionsInARow) {
      // A refused completion is the one stall the redirection has something
      // specific to say about: its issue codes are what stand between the
      // draft and a Flow.
      noProgress.redirect(step.iteration);
      return undefined;
    }
    return { error: input.unusableDecisions!.stalled({ issueCodes, trace: [...trace], accounting: { ...accounting } }) };
  };
  // **A loop that ran out of turns ends as that, whatever its last decision
  // was** (`./evidence-loop/exhaustion.ts` says what the other reading cost and
  // which live run it was). Shared by every allowance that can run out: the
  // budget's at the top of an iteration, the tool-call ceiling, and the literal
  // max-iteration exit.
  const exhausted = (bound: AutomationStudioLlmEvidenceLoopExhaustedBound): AutomationStudioLlmEvidenceLoopResult =>
    failure(draftSteps, "llm_evidence_loop.iteration_limit", trace, accounting, {
      bound,
      maxIterations: limits.maxIterations,
      iterations: accounting.iterations,
      draftSteps: draftSteps.length,
      // Counted exactly as an amendment's `keptStepCount` is, so the last row
      // of the trace and the ending cannot disagree about how much plan there
      // was: kept, and proposable.
      proposableSteps: draftSteps.filter((step) => step.disposition === "kept" && automationStudioFlowDraftStepIsProposable(step)).length,
      completionAttempts,
      // Only while the run of refusals is unbroken. A loop that ran out after a
      // decision it could use has no last refusal, and reporting the one before
      // it would be the same conflation in a smaller field.
      lastIssueCodes: unusableInARow ? [...lastIssueCodes] : []
    });
  // A call that threw or returned what is not a result: recorded and shown to
  // the model under its own call id when failures are observed. Returns the
  // result that ends the loop, or nothing when it should ask again.
  const toolFailed = (iteration: number, callId: string, tool: AutomationStudioLlmEvidenceTool, code: AutomationStudioLlmEvidenceToolFailureCode, value: JsonObject, usage?: AutomationStudioLlmUsageSummary, stateBefore?: string): AutomationStudioLlmEvidenceLoopResult | undefined => {
    // A failed action is part of the record: a live campaign's largest single
    // defect was a failed call that ended a build and left no trace of itself.
    // `effectApplied: false` is what says it did not happen. Saying it is not
    // an action at all would take it off the draft the model is shown, and an
    // action that was attempted and failed is part of the record of what was done.
    const draftChanged = draftRecord({ iteration, callId, ...callRecord(tool, value), effectApplied: false, resultCode: code, ...(stateBefore ? { stateBefore, stateAfter: stateBefore } : {}) });
    if (input.signal?.aborted) return failure(draftSteps, "llm_evidence_loop.cancelled", trace, accounting);
    if (!observeToolFailures) return failure(draftSteps, "llm_evidence_loop.tool_failed", trace, accounting);
    accounting.toolCalls += 1;
    failedToolCalls += 1;
    noProgress.stepped(tool.toolId);
    if (tool.effect === "mutate") { mutationEpoch += 1; attemptEpoch += 1; }
    const step: AutomationStudioLlmEvidenceLoopTrace = { iteration, decision: "tool_call", callId, toolId: tool.toolId, resultCode: code, ...(usage ? { usage } : {}) };
    if (noProgress.reached()) {
      recordRow(step, { draftChanged });
      return failure(draftSteps, "llm_evidence_loop.tool_failed", trace, accounting);
    }
    const record = automationStudioLlmEvidenceToolFailure({ code, toolId: tool.toolId, stepsWithoutProgress: noProgress.steps, maxStepsWithoutProgress: limits.maxStepsWithoutProgress });
    const recordBytes = reserveEvidence(record);
    recordRow(recordBytes === undefined ? step : { ...step, evidenceBytes: recordBytes }, { draftChanged });
    if (recordBytes === undefined) return failure(draftSteps, "llm_evidence_loop.evidence_limit", trace, accounting);
    evidence.push({ callId, toolId: tool.toolId, value: record, call: { resultCode: code, changed: tool.effect === "mutate" ? "unknown" : "no" } });
    noProgress.redirect(iteration);
    return undefined;
  };
  // A request the loop answers itself: the tool is not run, the result that
  // already answers it is moved to the end of the evidence, where the model's
  // window always reaches, and a note naming it follows. Returns the result
  // that ends the loop, or nothing when it should ask again.
  const answerRequest = (
    iteration: number,
    decision: Extract<AutomationStudioLlmEvidenceLoopDecision, { kind: "tool_call" }>,
    code: AutomationStudioLlmEvidenceAnsweredRequestCode,
    answeredByCallId: string
  ): AutomationStudioLlmEvidenceLoopResult | undefined => {
    noProgress.answeredFromEvidence(answeredByCallId, decision.toolId);
    const step: AutomationStudioLlmEvidenceLoopTrace = { iteration, decision: "tool_call", toolId: decision.toolId, resultCode: code, ...(decision.usage ? { usage: decision.usage } : {}) };
    if (noProgress.reached()) {
      recordRow({ ...step, resultCode: "llm_evidence_loop.rejected.repeat_without_progress" });
      return failure(draftSteps, "llm_evidence_loop.repeat_without_progress", trace, accounting);
    }
    const note = automationStudioLlmEvidenceAnsweredRequestNote({ code, toolId: decision.toolId, answeredByCallId, stepsWithoutProgress: noProgress.steps, maxStepsWithoutProgress: limits.maxStepsWithoutProgress });
    const answeredTool = toolsById.get(decision.toolId);
    const draftChanged = draftRecord({ iteration, actionId: decision.toolId, input: decision.input, effect: answeredTool?.effect ?? "observe", effectApplied: false, proposes: false, resultCode: code });
    const noteBytes = reserveEvidence(note);
    if (noteBytes === undefined) {
      recordRow(step, { draftChanged });
      return failure(draftSteps, "llm_evidence_loop.evidence_limit", trace, accounting);
    }
    const earlier = evidence.findIndex((entry) => entry.callId === answeredByCallId);
    if (earlier >= 0) evidence.push(...evidence.splice(earlier, 1));
    evidence.push({ callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_REQUEST_CHECK_TOOL_ID}.${iteration}`, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_REQUEST_CHECK_TOOL_ID, value: note });
    recordRow({ ...step, evidenceBytes: noteBytes }, { draftChanged });
    // After the note, so the redirection is the newest thing the model reads.
    noProgress.redirect(iteration);
    return undefined;
  };
  // The dry run (`../flow-draft/dry-run.ts`): before a completed result is
  // accepted, the draft is run again from where its first step started, with no
  // model attached, and a result whose draft did not replay clean is refused
  // back to the model rather than proposed. It applies only to a draft whose
  // steps say they can be run again, so a caller that cannot replay is not
  // gated on something it can never satisfy.
  const dryRun = automationStudioFlowDraftDryRunGate({
    enabled: drafting && input.dryRun !== false,
    steps: draftSteps,
    maxEvidenceBytes: limits.toolEvidenceBytes,
    executeTool: input.executeTool,
    reserveEvidence,
    showEvidence: (entry) => { evidence.push(entry); },
    targetMoved: () => { mutationEpoch += 1; attemptEpoch += 1; },
    ...(input.signal ? { signal: input.signal } : {})
  });
  const initialTool = input.tools.find((tool) => tool.initialObservation);
  if (initialTool) {
    const initialInput = initialTool.initialObservation!.input;
    if (input.signal?.aborted) return failure(draftSteps, "llm_evidence_loop.cancelled", trace, accounting);
    const callId = `initial.${initialTool.toolId}`;
    callIds.add(callId);
    let execution: ReturnType<typeof automationStudioLlmEvidenceParseToolExecutionResult> | "threw";
    let stateBefore: string | undefined;
    let stateAfter: string | undefined;
    try {
      stateBefore = await digest(callId, initialTool.toolId);
      execution = automationStudioLlmEvidenceParseToolExecutionResult(await input.executeTool({ callId, toolId: initialTool.toolId, value: structuredClone(initialInput), maxEvidenceBytes: limits.toolEvidenceBytes, ...(input.signal ? { signal: input.signal } : {}) }), initialTool.effect);
      stateAfter = await digest(callId, initialTool.toolId);
    } catch {
      execution = "threw";
    }
    if (execution === "threw" || !execution) {
      // Recorded like any failed call; the observation, never made, stays offered.
      const ended = toolFailed(0, callId, initialTool, execution ? "llm_evidence_loop.tool_failed" : "llm_evidence_loop.tool_result_invalid", initialInput, undefined, stateBefore);
      if (ended) return ended;
    } else {
      const evidenceBytes = Buffer.byteLength(JSON.stringify(execution.evidence), "utf8");
      if (evidenceBytes > limits.maxEvidenceBytes) return failure(draftSteps, "llm_evidence_loop.evidence_limit", trace, accounting);
      accounting.toolCalls = 1;
      accounting.evidenceBytes = evidenceBytes;
      // A free first look that was refused looked at nothing, so it is not
      // filed as this epoch's answer or as this tool's observation -- the same
      // rule the loop applies to every later call (`repeat-policy.ts`). Filing
      // it would make the model's first decision a repeat before it had been
      // shown anything. The host wrote this call's argument and is answerable
      // for it being a look, so it is judged as one whatever the tool declares.
      if (!automationStudioLlmEvidenceLookWasRefused({ evidence: execution.evidence, effect: "observe", effectApplied: execution.effectApplied })) {
        answeredRequests.set(automationStudioLlmEvidenceCanonicalJson([mutationEpoch, initialTool.toolId, initialInput]), callId);
        observationEpochs.set(initialTool.toolId, attemptEpoch);
        latestObservations.set(initialTool.toolId, callId);
      }
      evidence.push({ callId, toolId: initialTool.toolId, value: execution.evidence, call: { resultCode: execution.resultCode ?? "ok", changed: "no" } });
      // The free look is this tool's last answer as much as any other call is,
      // so a first decision that asks for it again and gets the same bytes back
      // is a step without progress rather than the loop's first step.
      noProgress.answered(initialTool.toolId, JSON.stringify(execution.evidence));
      const draftChanged = draftRecord({ iteration: 0, callId, ...callRecord(initialTool, initialInput, execution), effect: "observe", effectApplied: false, ...(execution.resultCode ? { resultCode: execution.resultCode } : {}) });
      const pageState: AutomationStudioLlmEvidenceLoopProgress["pageState"] = stateBefore === undefined || stateAfter === undefined
        ? "unobserved"
        : stateBefore === stateAfter ? "unchanged" : "changed";
      recordRow({ iteration: 0, decision: "tool_call", callId, toolId: initialTool.toolId, evidenceBytes, ...(execution.resultCode ? { resultCode: execution.resultCode } : {}), ...callDiagnostic(execution) }, { draftChanged, pageState });
    }
  }
  for (let iteration = 1; iteration <= limits.maxIterations; iteration += 1) {
    if (input.signal?.aborted) return failure(draftSteps, "llm_evidence_loop.cancelled", trace, accounting);
    accounting.iterations = iteration;
    draftShown = undefined;
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
    offeredCompletion = canComplete;
    if (!eligibleTools.length && !canComplete) return failure(draftSteps, "llm_evidence_loop.repeat_without_progress", trace, accounting);
    // What the budget leaves (`loop-budget.ts`): told to the model as
    // the newest entry, and a last decision that is offered only completion.
    const remaining = input.budget && automationStudioLlmEvidenceLoopRemaining(input.budget, {
      decisions: iteration - 1, reportedDecisions, totalTokens: accounting.totalTokens, estimatedCostUsd: accounting.estimatedCostUsd, elapsedMs: clock() - startedAtMs
    }, limits.maxIterations - iteration + 1);
    // Nothing left to pay for a decision with. The run's budget is what ran
    // out, which a retry raises; what the last decision happened to be is
    // recorded beside it and is not the ending.
    if (remaining && remaining.decisionsLeft === 0) return exhausted("budget");
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
      // Measured as it goes out, because nothing downstream can work out
      // afterwards what the model saw. The entry shrinks itself to fit -- its
      // arguments, then the length of its guidance, then the oldest steps -- and
      // this loop reserved the bytes and never learned which of those happened.
      // So a run could not answer "was the model shown its whole draft?" without
      // rebuilding the steps from the rest of the trace by hand, and the one
      // configuration that showed the model no draft at all did so in complete
      // silence (`./evidence-loop/draft-shown.ts`).
      draftShown = draftEntry
        ? automationStudioLlmEvidenceLoopDraftShown({ value: draftEntry.value, budget: limits.draftBytes, minBytes: AUTOMATION_STUDIO_LLM_EVIDENCE_MIN_DRAFT_BYTES })
        : undefined;
      const beside = [draftEntry, budgetEntry].filter((entry) => entry !== undefined);
      const besideBytes = beside.reduce((total, entry) => total + Buffer.byteLength(JSON.stringify(entry), "utf8") + 1, 0);
      const window = automationStudioLlmEvidenceContextWindow(evidence, limits.maxEvidenceContextBytes - besideBytes, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxToolCalls - beside.length);
      const shown = [...window, ...beside];
      noProgress.shown(shown.map((entry) => entry.callId));
      decision = automationStudioLlmEvidenceParseDecision(await input.decide({ iteration, tools: offered, evidence: shown, decisionSchema, canComplete, ...(input.signal ? { signal: input.signal } : {}) }));
    } catch (thrown) {
      if (input.signal?.aborted) return failure(draftSteps, "llm_evidence_loop.cancelled", trace, accounting);
      let error = thrown;
      if (input.unusableDecisions && thrown instanceof AutomationStudioLlmUnusableDecisionError) {
        const resultCode = thrown.issueCodes[0];
        const stalled = unusable({ iteration, decision: "unusable", ...(resultCode ? { resultCode } : {}) }, thrown.issueCodes);
        if (!stalled) {
          // The model is told what was wrong, as evidence, before it is asked again.
          const feedback = automationStudioLlmUnusableDecisionFeedback({ issueCodes: thrown.issueCodes, stepsWithoutProgress: noProgress.steps, maxStepsWithoutProgress: limits.maxStepsWithoutProgress });
          if (reserveEvidence(feedback) === undefined) return failure(draftSteps, "llm_evidence_loop.evidence_limit", trace, accounting);
          evidence.push({ callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID}.${iteration}`, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID, value: feedback });
          continue;
        }
        error = stalled.error;
      }
      if (input.propagateDecisionErrors) throw error;
    }
    if (!decision) return failure(draftSteps, "llm_evidence_loop.invalid_decision", trace, accounting);
    automationStudioLlmEvidenceLoopAddUsage(accounting, decision.usage);
    if (decision.usage) reportedDecisions += 1;
    if (decision.kind === "complete") {
      completionAttempts += 1;
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
        // Last, because it is the only check that costs seconds and touches the
        // world: a plan that does not even assemble is refused before anything
        // is replayed.
        const refusedDryRun = await dryRun();
        if (refusedDryRun === "cancelled") return failure(draftSteps, "llm_evidence_loop.cancelled", trace, accounting);
        if (refusedDryRun === "evidence_limit") return failure(draftSteps, "llm_evidence_loop.evidence_limit", trace, accounting);
        if (refusedDryRun) {
          if (!input.unusableDecisions) return failure(draftSteps, "llm_evidence_loop.invalid_decision", trace, accounting);
          const stalledReplay = unusable(
            { iteration, decision: "unusable", resultCode: AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_ISSUE_CODE, ...(decision.usage ? { usage: decision.usage } : {}) },
            refusedDryRun.issueCodes,
            { ...(check.answerability ? { answerability: check.answerability } : {}) }
          );
          if (!stalledReplay) continue;
          if (input.propagateDecisionErrors) throw stalledReplay.error;
          return failure(draftSteps, "llm_evidence_loop.invalid_decision", trace, accounting);
        }
        recordRow(
          { iteration, decision: "complete", ...(decision.usage ? { usage: decision.usage } : {}) },
          { ...(check.answerability ? { answerability: check.answerability } : {}) }
        );
        return { ok: true, result: decision.result, trace, steps: draftSteps, accounting };
      }
      if (!check || !input.unusableDecisions) return failure(draftSteps, "llm_evidence_loop.invalid_decision", trace, accounting);
      // The model is told why, as evidence, before it is asked again.
      if (reserveEvidence(check.feedback) === undefined) return failure(draftSteps, "llm_evidence_loop.evidence_limit", trace, accounting);
      evidence.push({ callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID}.${iteration}`, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID, value: check.feedback });
      const resultCode = check.issueCodes[0];
      const stalled = unusable(
        { iteration, decision: "unusable", ...(resultCode ? { resultCode } : {}), ...(decision.usage ? { usage: decision.usage } : {}) },
        check.issueCodes,
        { ...(check.answerability ? { answerability: check.answerability } : {}) }
      );
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
      const rerun = automationStudioLlmEvidenceRerunRequest(decision.amendments, draftSteps, toolIds);
      const targetedStepIds = [...new Set(decision.amendments.flatMap((amendment) => {
        const step = draftSteps.find((candidate) => candidate.position === amendment.step);
        return step?.id ? [step.id] : [];
      }))];
      const rerunStepId = rerun.request
        ? draftSteps.find((candidate) => candidate.position === rerun.request!.step)?.id
        : undefined;
      const amended = applyAutomationStudioFlowDraftAmendments(draftSteps, decision.amendments.filter((amendment) => amendment.change !== "rerun"));
      if (rerun.request) applyAutomationStudioFlowDraftAmendments(draftSteps, [{ step: rerun.request.step, change: "drop" }]);
      // **Every refusal of this decision on one path, the draft's and the
      // loop's own.** A `rerun` is filtered out of the apply call above, so the
      // draft never sees one and never refuses one -- and a rerun this loop
      // could not carry out was therefore the one amendment that changed
      // nothing silently, on a build where every other kind had been telling the
      // model why since t140. The row records both and the model is shown both.
      const refused = [...amended.refused, ...rerun.refused];
      // How many steps the decision edited, beside which kind of edit it was
      // (`./evidence-loop/draft-change.ts` says why a count had to join the word).
      const draftChange: AutomationStudioLlmEvidenceLoopDraftChange = {
        targetedStepIds,
        appliedCount: amended.applied + (rerun.request ? 1 : 0),
        refusedCount: refused.length,
        keptStepCount: draftSteps.filter((step) => step.disposition === "kept" && automationStudioFlowDraftStepIsProposable(step)).length,
        ...(rerunStepId ? { rerunStepId } : {})
      };
      recordRow(
        { iteration, decision: "amend_draft", resultCode: rerun.request ? "llm_evidence_loop.draft_rerun" : amended.applied ? "llm_evidence_loop.draft_amended" : "llm_evidence_loop.draft_unchanged", amended: amended.applied, ...(refused.length ? { amendmentsRefused: refused } : {}), ...(decision.usage ? { usage: decision.usage } : {}) },
        { draftChanged: Boolean(amended.applied || rerun.request), draftChange }
      );
      // An edit is progress on the draft and never on the evidence, so an edit
      // that landed neither clears the no-progress guard nor is spent by it --
      // and an edit that changed nothing does count, because that guard is the
      // only thing that stops a model editing one step forever. Six of these in
      // a row, all `draft_unchanged` with the same two step ids refused each
      // time, is the first half of `run-mulum3x7-18ceeb75`, so the redirection
      // is what the sixth gets rather than nothing at all.
      if (!rerun.request && !amended.applied) {
        noProgress.stepped();
        if (noProgress.reached()) return failure(draftSteps, "llm_evidence_loop.repeat_without_progress", trace, accounting);
        noProgress.redirect(iteration);
      }
      // The model is told which of its amendments changed nothing and why, as
      // evidence, before it is asked again -- the same way a refused completion
      // is. After the guard, so the count it is shown is the one it is being
      // held to; whenever anything was refused, because an edit that half landed
      // is one the model must still be told about.
      if (refused.length) {
        const amendmentFeedback = automationStudioLlmEvidenceDraftAmendmentFeedback({
          refusals: refused, applied: amended.applied, steps: draftSteps, stepsWithoutProgress: noProgress.steps, maxStepsWithoutProgress: limits.maxStepsWithoutProgress
        });
        if (reserveEvidence(amendmentFeedback) === undefined) return failure(draftSteps, "llm_evidence_loop.evidence_limit", trace, accounting);
        evidence.push({ callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_AMENDMENT_FEEDBACK_TOOL_ID}.${iteration}`, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_AMENDMENT_FEEDBACK_TOOL_ID, value: amendmentFeedback });
      }
      if (!rerun.request) continue;
      // From here the rerun is an ordinary call -- the same budget, the same
      // digests, the same draft entry -- with one exception, below: it is not a
      // repeat. The model has just said to do this again, and answering it from
      // the result already held is how a live build spent seven decisions
      // asking for the same rerun and getting `already_answered` each time
      // (`run-mud9rpmz-16de647b`).
      rerunning = true;
      decision = { kind: "tool_call", callId: rerun.request.callId, toolId: rerun.request.toolId, input: rerun.request.input };
    }
    unusableInARow = 0;
    // The last decision the budget allowed was offered only completion, and was
    // spent on something else. The budget is still what ran out.
    if (finalDecision) return exhausted("budget");
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
    const callId = automationStudioLlmEvidenceUnusedCallId(callIds, decision.callId);
    // Turns left, but no allowance to run anything with them. This reported
    // `iteration_limit` with nothing to say which of the two ceilings it was --
    // the same borrowing, one file down, that made an exhausted loop read as a
    // refused one. Same code, because both are an allowance running out; the
    // record now names which.
    if (accounting.toolCalls >= limits.maxToolCalls) return exhausted("tool_calls");
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
    const record = callRecord(tool, decision.input, execution);
    // A look the domain refused looked at nothing, so it did not answer the
    // request it was registered against and the identical retry must be run
    // rather than answered from it (`repeat-policy.ts` says why this is the
    // look and never the action). Both doors have to open: the request's own
    // signature, and the tool's latest observation for this epoch -- leaving
    // either shut answers the retry from a refusal carrying nothing.
    const lookRefused = automationStudioLlmEvidenceLookWasRefused({ evidence: value, effect: record.effect, effectApplied });
    if (lookRefused) answeredRequests.delete(toolRequestSignature);
    if (record.effect === "mutate") { attemptEpoch += 1; if (effectApplied) mutationEpoch += 1; }
    if (!lookRefused && automationStudioLlmEvidenceLookNeedsAttempt(tool, mutableTools)) {
      observationEpochs.set(tool.toolId, attemptEpoch);
      latestObservations.set(tool.toolId, callId);
    }
    evidence.push({ callId, toolId: decision.toolId, value, call: { resultCode: resultCode ?? "ok", changed: record.effect === "mutate" && effectApplied ? "yes" : "no" } });
    const draftChanged = draftRecord({ iteration, callId, ...record, effectApplied, ...(resultCode ? { resultCode } : {}), ...(stateBefore !== undefined && stateAfter !== undefined ? { stateBefore, stateAfter } : {}) });
    const pageState: AutomationStudioLlmEvidenceLoopProgress["pageState"] = stateBefore === undefined || stateAfter === undefined
      ? "unobserved"
      : stateBefore === stateAfter ? "unchanged" : "changed";
    recordRow(
      { iteration, decision: "tool_call", callId, toolId: decision.toolId, evidenceBytes, ...(record.effect === "mutate" ? { effectApplied } : {}), ...(resultCode ? { resultCode } : {}), ...callDiagnostic(execution), ...(decision.usage ? { usage: decision.usage } : {}) },
      { draftChanged, pageState }
    );
    // **What the loop learned, not what it ran.** The whole rule -- the four
    // ways of learning nothing, why a refused look counts, why a repeat that
    // announces itself needs the caller to say so, and the live runs each was
    // measured on -- is in `./evidence-loop/no-progress.ts`. A call that
    // changed something is always progress; anything else whose answer is the
    // one its own tool already gave is not, whatever its code says.
    const repeated = noProgress.answerRepeats({
      toolId: decision.toolId,
      answer: JSON.stringify(value),
      // The caller's statement about *this* call, not its tool's standing
      // declaration, which is what lets one tool run a whole library.
      mutated: record.effect === "mutate" && effectApplied,
      ...(execution.repeatedAnswer === undefined ? {} : { repeatedAnswer: execution.repeatedAnswer })
    });
    if (!repeated && !automationStudioLlmEvidenceNothingHappened({ evidence: value, effectApplied })) noProgress.cleared();
    else {
      noProgress.stepped(decision.toolId);
      if (noProgress.reached()) return failure(draftSteps, "llm_evidence_loop.repeat_without_progress", trace, accounting);
      noProgress.redirect(iteration);
    }
  }
  return exhausted("iterations");
}
