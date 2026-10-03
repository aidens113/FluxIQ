import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS } from "../loop-limits/index.ts";
import {
  AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_TOOL_ID,
  automationStudioFlowDraftClaimAct, automationStudioFlowDraftKeepOpeners,
  automationStudioFlowDraftReplaySignature,
  automationStudioFlowDraftStepIsAction,
  automationStudioFlowDraftStepIsProposable, automationStudioFlowDraftStepWordsOf,
  type AutomationStudioFlowDraftStep
} from "../flow-draft/index.ts";
// The record of every decision and what the loop answered it, and what one
// decision is shown beside the window (`decision-context/`).
import {
  AutomationStudioLlmDecisionContextRecorder,
  automationStudioLlmDecisionContextShown,
  automationStudioLlmDecisionContextSignature,
  automationStudioLlmDecisionContextSupersede
} from "./decision-context/index.ts";
// What the loop does with each kind of answer it gives the model -- a
// completion, an amendment, a failed call, a request answered from what it
// holds -- each handed the loop's state as one context object
// (`decision-handlers/`).
import {
  AUTOMATION_STUDIO_LLM_EVIDENCE_LOOK_WITHDRAWN_CODE,
  automationStudioLlmEvidenceAnswerCheck,
  automationStudioLlmEvidenceAskedAgain,
  automationStudioLlmEvidenceHandleAmendment, automationStudioLlmEvidenceSettleHeldAmendments,
  automationStudioLlmEvidenceHandleAnsweredRequest,
  automationStudioLlmEvidenceHandleRefusedRepeat, automationStudioLlmEvidenceSearchingWithoutActing,
  automationStudioLlmEvidenceHandleCompletion,
  automationStudioLlmEvidenceHandleFailedCall,
  automationStudioLlmEvidenceLookWithdrawal,
  automationStudioLlmEvidenceReaskOutcome,
  automationStudioLlmEvidenceShowVerifiedRepeat,
  type AutomationStudioLlmEvidenceAnswerCheckOutcome,
  type AutomationStudioLlmEvidenceDecisionHandlerContext,
  type AutomationStudioLlmEvidenceLoopCounters, type AutomationStudioLlmEvidenceRerunHeld,
  type AutomationStudioLlmEvidenceRowTransition as RowTransition
} from "./decision-handlers/index.ts";
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
  AUTOMATION_STUDIO_LLM_EVIDENCE_NO_PROGRESS_TOOL_ID,
  AUTOMATION_STUDIO_LLM_EVIDENCE_REQUEST_CHECK_TOOL_ID,
  automationStudioLlmEvidenceAmendmentMemory,
  automationStudioLlmEvidenceDecisionRefusal,
  automationStudioLlmEvidenceCallDiagnostic as callDiagnostic,
  automationStudioLlmEvidenceCallRecord as callRecord,
  automationStudioLlmEvidenceResumeEntry,
  automationStudioLlmEvidenceLoopAddUsage,
  automationStudioLlmEvidenceLoopEmptyAccounting,
  automationStudioLlmEvidenceLoopFailure as failure,
  automationStudioLlmEvidenceNoProgress,
  automationStudioLlmEvidenceUnusedCallId, automationStudioLlmEvidenceLoopProgressTrace, automationStudioLlmEvidenceFinalDecisionRow, automationStudioLlmEvidenceLoopPurse,
  type AutomationStudioLlmEvidenceLoopDecision, type AutomationStudioLlmEvidenceTool,
  type AutomationStudioLlmEvidenceLoopExhaustedBound,
  type AutomationStudioLlmEvidenceLoopResult,
  automationStudioLlmEvidenceRerunReplaced,
  automationStudioLlmEvidenceAuthoredProgress, automationStudioLlmEvidenceLoopTraceRecorder, automationStudioLlmEvidenceLoopExhaustion,
  type AutomationStudioLlmEvidenceLoopTrace,
  type AutomationStudioLlmEvidenceLoopProgress
} from "./evidence-loop/index.ts";
import { automationStudioFlowDraftDryRunGate, automationStudioNodeRerunFromItsPlace, automationStudioNodeRerunPlaceNoted } from "./node-tools/index.ts";
import type { AutomationStudioLlmBuildPurseRefusal } from "./build-purse/index.ts";
import type { AutomationStudioLlmEvidenceEntry } from "./context-window.ts";
import {
  automationStudioLlmEvidenceCanonicalJson,
  automationStudioLlmEvidenceParseDecision,
  automationStudioLlmEvidenceParseToolExecutionResult,
  automationStudioLlmEvidenceToolResultInvalidCode,
  automationStudioLlmEvidenceValidTools,
  buildAutomationStudioLlmEvidenceLoopDecisionSchema
} from "./evidence-loop-decision.ts";
import { automationStudioLlmEvidenceLookNeedsAttempt, automationStudioLlmEvidenceLookWasRefused, automationStudioLlmEvidenceNothingHappened, automationStudioLlmEvidenceRequestSignature } from "./repeat-policy.ts";
// What a loop may be configured with, and how those numbers resolve
// (`loop-configuration.ts`). Re-exported below, so the loop's public
// surface is unchanged.
import { automationStudioLlmEvidenceLoopSeedSteps, resolveLimits, type AutomationStudioLlmEvidenceLoopInput } from "./loop-configuration.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_WRAP_UP_DECISIONS, automationStudioLlmEvidenceBudgetEntry, automationStudioLlmEvidenceLoopBudgetValid, automationStudioLlmEvidenceLoopRemaining, type AutomationStudioLlmEvidenceLoopBudget, type AutomationStudioLlmEvidenceLoopRemaining } from "./loop-budget.ts";
import {
  AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID,
  AutomationStudioLlmUnusableDecisionError,
  automationStudioLlmUnusableDecisionFeedback,
  automationStudioLlmUnusableDecisionIssueSet,
  type AutomationStudioLlmUnusableDecisionOffers
} from "./unusable-decision.ts";
import { automationStudioLlmReplyUnreadable, automationStudioLlmUnreadableReplies } from "./unreadable-reply.ts";
import { automationStudioLlmProviderUnanswered, automationStudioLlmProviderUnansweredCount } from "./unanswered-calls.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_CHECK_TOOL_ID, automationStudioLlmEvidenceRepeatGuard } from "./repeat-guard/index.ts";

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
/** The entry every earlier decision, and what the loop answered it, is shown under. */
export { AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID } from "./decision-context/index.ts";
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
 * and republished here, because a dozen modules across the runtime import them
 * from this path and the split is meant to be one none of them notices.
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
export { AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID, type AutomationStudioLlmEvidenceRestoredStep } from "./evidence-loop/index.ts";


/**
 * Coordinates an allowlisted, bounded evidence-gathering loop. Provider grants,
 * request budgets, and final artifact validation remain authoritative in the
 * callbacks that already own those responsibilities.
 */
export async function runAutomationStudioLlmEvidenceLoop(
  untraced: AutomationStudioLlmEvidenceLoopInput
): Promise<AutomationStudioLlmEvidenceLoopResult> {
  const input = automationStudioLlmEvidenceLoopProgressTrace(untraced); const limits = resolveLimits(input);
  const trace: AutomationStudioLlmEvidenceLoopTrace[] = [];
  // The one door every row enters the record through: it stamps each with the
  // draft its decision was shown, its progress and its moment, and remembers the
  // draft's revision and the last answerability between rows (`./evidence-loop/trace.ts`).
  const rows = automationStudioLlmEvidenceLoopTraceRecorder(trace);
  const recordRow = rows.record;
  // The draft (`runtime/flow-draft/`): every action appended as it happens, so
  // a result is written from what the loop did rather than from what is still
  // in front of the model. Kept whether or not it is shown.
  const draftSteps: AutomationStudioFlowDraftStep[] = automationStudioLlmEvidenceLoopSeedSteps(input.draft);
  const drafting = input.draft !== false;
  // Who decides which steps are in the Flow: the model, unless a recorded build is replayed under the old rule (`./loop-configuration.ts`).
  const authoring = input.draftAuthoring !== "transcript";
  // Whether the authored draft has advanced toward the acts: progress, where the model authors it (`./evidence-progress/authored-progress.ts`).
  const authored = authoring && drafting ? automationStudioLlmEvidenceAuthoredProgress({ steps: draftSteps, actsMissing: input.draft ? input.draft.actsMissing : undefined }) : undefined;
  // The numbers the loop and its handlers both move (`decision-handlers/types.ts` says what each counts).
  const counters: AutomationStudioLlmEvidenceLoopCounters = { draftAmendments: 0, unusableInARow: 0, completionAttempts: 0, failedToolCalls: 0, mutationEpoch: 0, attemptEpoch: 0 };
  // Refusals already given, and drafts already stood at (`./evidence-loop/amendment-memory.ts`).
  const amendmentMemory = automationStudioLlmEvidenceAmendmentMemory();
  // Steps appended so far, ever, including any since withdrawn: the source of
  // the id below, so no two steps of one build ever share one.
  let draftAppended = draftSteps.reduce((largest, step) => {
    const match = /^d([0-9]+)$/.exec(step.id ?? "");
    return match ? Math.max(largest, Number(match[1])) : largest;
  }, 0);
  const draftRecord = (step: Omit<AutomationStudioFlowDraftStep, "position" | "disposition" | "id">, authored?: { add?: true | undefined; act?: string | undefined }): boolean => {
    draftAppended += 1;
    // The step's own name, which a position stops being the moment the draft is
    // reordered. Routing statements are kept under it (`../flow-draft/routing.ts`).
    // A step that ran is `taken` -- evidence, not a step of the Flow -- unless
    // the model added it as it ran it and it worked (`../flow-draft/step.ts`).
    const appended: AutomationStudioFlowDraftStep = { ...step, position: draftSteps.length + 1, id: `d${draftAppended}`, disposition: authoring ? "taken" : "kept" };
    if (authoring && authored?.add && automationStudioFlowDraftStepIsProposable(appended)) {
      appended.disposition = "kept";
      if (authored.act !== undefined && appended.effect === "mutate") automationStudioFlowDraftClaimAct(draftSteps, appended, authored.act); // A read does no act (`../flow-draft/amendment.ts`, `act_on_a_read`); one act, one step (`../flow-draft/act-claim.ts`).
    }
    draftSteps.push(appended);
    if (authoring && appended.disposition === "kept") automationStudioFlowDraftKeepOpeners(draftSteps, appended); // The press that opened its page joins it (`../flow-draft/opener.ts`).
    return drafting && automationStudioFlowDraftStepIsAction(appended);
  };
  // A digest of the whole state, when the caller offered to take one. It is
  // taken inside the same attempt as the call it brackets, so a hook that
  // throws makes the step a recorded failure the model and the reader can both
  // see, rather than a step that quietly has no digests.
  const hook = input.captureStateDigest;
  const digest = async (callId: string, toolId: string): Promise<string | undefined> =>
    hook ? hook({ callId, toolId, ...(input.signal ? { signal: input.signal } : {}) }) : undefined;
  // The states either side of a call: the hook's, when the caller offered one,
  // otherwise the ones the call reported from its own captures -- never both at
  // one point (`loop-configuration.ts`, `captureStateDigest`). Reading them off
  // the result is what keeps a look at one capture rather than three.
  const statesOf = (execution: { stateDigests?: { before?: string; after?: string } }, before: string | undefined, after: string | undefined): { before: string | undefined; after: string | undefined } =>
    hook ? { before, after } : { before: execution.stateDigests?.before, after: execution.stateDigests?.after };
  // Looks withdrawn after an ignored redirect (`decision-handlers/look-withdrawal.ts`),
  // only where a decision can be refused without ending the loop.
  const looks = automationStudioLlmEvidenceLookWithdrawal({ enabled: input.lookWithdrawal !== false && input.unusableDecisions !== undefined });
  const accounting = automationStudioLlmEvidenceLoopEmptyAccounting(); const purse = automationStudioLlmEvidenceLoopPurse(input.budget, accounting, input.purse); // Each decision's worst case held against the build's purse, or the loop's own at its cost budget, before it is sent: the only cost authority (`./evidence-loop/cost-purse.ts`).
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
  // Everything gathered, whatever its size: each decision is shown all of it
  // (`context-window.ts`), and the total is only counted. A Core note leaves
  // it when a newer note of its kind arrives (`decision-context/supersede.ts`);
  // a tool's result never does.
  const evidence: AutomationStudioLlmEvidenceEntry[] = [];
  // Every decision and what the loop answered it, one row per place the loop
  // answers the model, shown beside the window (`decision-context/`).
  const history = new AutomationStudioLlmDecisionContextRecorder();
  const observeToolFailures = (input.toolFailures ?? (input.unusableDecisions ? "observe" : "end")) === "observe";
  // The latest unusable decision's issues, beside the count of them in a row.
  let lastIssueCodes: readonly string[] = [];
  // The budget's clock and the decisions whose usage it could count.
  const clock = input.budget?.now ?? Date.now;
  const startedAtMs = clock();
  let reportedDecisions = 0;
  let finalDecision = false;
  // What the budget left last: which bound an exhausted loop ran out of.
  let lastRemaining: AutomationStudioLlmEvidenceLoopRemaining | undefined;
  // Whether this iteration offered the model the chance to finish. Read by the
  // redirection rather than passed to it: it is pushed from five places, only
  // two of them inside the iteration that worked this out, and telling a model
  // to finish when finishing is not on offer is what that entry must never do.
  let offeredCompletion = false;
  // Everything the loop remembers in order to tell working from repeating, and
  // what it says when the answer is repeating (`./evidence-progress/no-progress.ts`
  // states the whole rule and the run it was measured on). The stop is the last
  // resort: several steps earlier this starts telling the model plainly that it
  // already holds what it keeps asking for, at no cost in calls or iterations.
  const noProgress = automationStudioLlmEvidenceNoProgress({
    max: limits.maxStepsWithoutProgress,
    redirectAt: limits.redirectAtStepsWithoutProgress,
    facts: () => ({
      proposableSteps: draftSteps.filter((step) => step.disposition === "kept" && automationStudioFlowDraftStepIsProposable(step)).length,
      completionAttempts: counters.completionAttempts,
      canComplete: offeredCompletion,
      answerability: rows.answerability,
      looksWithdrawn: looks.active(counters.attemptEpoch),
      actsMissing: input.draft ? input.draft.actsMissing?.(draftSteps) : undefined,
      // The checklist, so a stall note about an act a step already names corrects that step (`./evidence-progress/stall-redirect.ts`).
      acts: input.draft ? input.draft.acts?.(draftSteps) : undefined
    }),
    show: (iteration: number, note: JsonObject) => {
      accountEvidence(note);
      automationStudioLlmDecisionContextSupersede(evidence, AUTOMATION_STUDIO_LLM_EVIDENCE_NO_PROGRESS_TOOL_ID);
      evidence.push({ callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_NO_PROGRESS_TOOL_ID}.${iteration}`, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_NO_PROGRESS_TOOL_ID, value: note });
      history.record(iteration, { kind: "redirect", ...(typeof note.code === "string" ? { code: note.code } : {}) });
      looks.redirectShown(iteration);
    }
  });
  // Counts evidence the loop itself adds in `accounting` and returns its
  // bytes. It is a count, never a limit: nothing the loop gathers is refused
  // for its size (`context-window.ts`).
  const accountEvidence = (value: JsonValue): number => {
    const bytes = Buffer.byteLength(JSON.stringify(value), "utf8");
    accounting.evidenceBytes += bytes;
    return bytes;
  };
  // One more unusable decision. Returns the error that ends the loop once a
  // guard is reached, or nothing when the loop should ask again.
  const unusable = (step: AutomationStudioLlmEvidenceLoopTrace, issueCodes: readonly string[], transition?: RowTransition): { error: unknown } | undefined => {
    counters.unusableInARow += 1;
    lastIssueCodes = issueCodes;
    if (transition) noProgress.completionRefused(issueCodes);
    const issueSet = automationStudioLlmUnusableDecisionIssueSet(issueCodes);
    // A refused completion also counts when the same draft was refused the same way before, whatever ran between (`./evidence-progress/no-progress.ts`).
    const sameDraftRefusedAgain = transition !== undefined && noProgress.refusedAgain(automationStudioFlowDraftReplaySignature(draftSteps), issueSet);
    if (noProgress.sameIssuesAgain(issueSet) || sameDraftRefusedAgain) noProgress.stepped();
    else noProgress.restarted();
    recordRow(step, transition);
    if (!noProgress.reached() && counters.unusableInARow < limits.maxUnusableDecisionsInARow) {
      // A refused completion is the one stall the redirection has something
      // specific to say about: its issue codes are what stand between the
      // draft and a Flow.
      noProgress.redirect(step.iteration);
      return undefined;
    }
    return { error: input.unusableDecisions!.stalled({ issueCodes, trace: [...trace], accounting: { ...accounting }, steps: draftSteps.map((draftStep) => structuredClone(draftStep)) }) };
  };
  // An unusable decision, answered: recorded, then either told to the model as
  // evidence before it is asked again, or the error that ends the loop.
  const refuseDecision = (
    iteration: number,
    issueCodes: readonly string[],
    offers: { tools: boolean; complete: boolean; amend: boolean },
    usage?: AutomationStudioLlmEvidenceLoopTrace["usage"],
    resultReason?: string
  ): "ask_again" | { error: unknown } => {
    const resultCode = issueCodes[0];
    history.record(iteration, { kind: "unusable", signature: automationStudioLlmDecisionContextSignature({ kind: "unusable", issueCodes }), issueCodes });
    const stalled = unusable({ iteration, decision: "unusable", ...(resultCode ? { resultCode } : {}), ...(resultReason ? { resultReason } : {}), ...(usage ? { usage } : {}) }, issueCodes);
    if (stalled) return stalled;
    // The model is told what was wrong, as evidence, before it is asked again.
    const feedback = automationStudioLlmUnusableDecisionFeedback({ issueCodes, stepsWithoutProgress: noProgress.steps, maxStepsWithoutProgress: limits.maxStepsWithoutProgress, offers });
    accountEvidence(feedback);
    automationStudioLlmDecisionContextSupersede(evidence, AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID);
    evidence.push({ callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID}.${iteration}`, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID, value: feedback });
    return "ask_again";
  };
  // A reply that arrived and could not be read (`./unreadable-reply.ts`): its own
  // count, never the no-progress guard's -- the model repeated nothing -- asked
  // again with the same context and a note of what could not be read, until an
  // unbroken run of them ends the loop as exactly that.
  const unreadable = automationStudioLlmUnreadableReplies(limits.maxUnreadableRepliesInARow);
  // A call that got no answer at all (`./unanswered-calls.ts`): nothing is
  // said to the model, which did nothing, and an unbroken run of them ends the
  // loop as an outage rather than as the model's stall.
  const unanswered = automationStudioLlmProviderUnansweredCount();
  const unreadableReply = (iteration: number, thrown: AutomationStudioLlmUnusableDecisionError, offers: AutomationStudioLlmUnusableDecisionOffers): "ask_again" | AutomationStudioLlmEvidenceLoopResult => {
    const { issueCodes, reply } = thrown;
    const ended = unreadable.unread(reply?.case ?? issueCodes[0]!);
    history.record(iteration, { kind: "unusable", signature: automationStudioLlmDecisionContextSignature({ kind: "unusable", issueCodes }), issueCodes });
    recordRow({ iteration, decision: "unusable", resultCode: issueCodes[0]!, ...(reply ? { resultReason: reply.case } : {}), ...(reply?.usage ? { usage: reply.usage } : {}) });
    if (ended) return failure(draftSteps, "llm_evidence_loop.unreadable_replies", trace, accounting, undefined, unreadable.summary());
    const feedback = automationStudioLlmUnusableDecisionFeedback({ issueCodes, stepsWithoutProgress: noProgress.steps, maxStepsWithoutProgress: limits.maxStepsWithoutProgress, offers, unreadable: { reply, inARow: unreadable.inARow, maxInARow: limits.maxUnreadableRepliesInARow } });
    accountEvidence(feedback);
    automationStudioLlmDecisionContextSupersede(evidence, AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID);
    evidence.push({ callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID}.${iteration}`, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID, value: feedback });
    return "ask_again";
  };
  // **A loop that ran out of turns ends as that, whatever its last decision
  // was** (`./evidence-loop/exhaustion.ts` says what the other reading cost and
  // which live run it was). Shared by every allowance that can run out: the
  // budget's at the top of an iteration, the tool-call ceiling, and the literal
  // max-iteration exit.
  // What the record says is built in `./evidence-loop/exhaustion.ts`; `costRefusal` is the purse's refusal, the only cost ending.
  const exhausted = (bound: AutomationStudioLlmEvidenceLoopExhaustedBound, costRefusal?: AutomationStudioLlmBuildPurseRefusal): AutomationStudioLlmEvidenceLoopResult =>
    failure(draftSteps, "llm_evidence_loop.iteration_limit", trace, accounting, automationStudioLlmEvidenceLoopExhaustion({
      bound, maxIterations: limits.maxIterations, iterations: accounting.iterations, draftSteps, completionAttempts: counters.completionAttempts,
      unusableInARow: counters.unusableInARow, lastIssueCodes, lastRemaining, purseRefusal: costRefusal, outstandingIssueCodes: noProgress.outstanding
    }));
  // The dry run (`../flow-draft/dry-run.ts`): before a completed result is
  // accepted, the draft is run again from where its first step started, with no
  // model attached, and a result whose draft did not replay clean is refused
  // back to the model rather than proposed. It applies only to a draft whose
  // steps say they can be run again, so a caller that cannot replay is not
  // gated on something it can never satisfy.
  const dryRun = automationStudioFlowDraftDryRunGate({
    enabled: drafting && input.dryRun !== false,
    steps: draftSteps,
    executeTool: input.executeTool,
    accountEvidence,
    // What the gate did is also what the history records of a completion attempt.
    showEvidence: (entry) => { evidence.push(entry); if (entry.toolId === AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_TOOL_ID) handling.dryRunSeen.verdict = entry.value; },
    targetMoved: () => { counters.mutationEpoch += 1; counters.attemptEpoch += 1; handling.dryRunSeen.ran = true; handling.repeats.moved(); },
    reusedClean: () => { handling.dryRunSeen.reused = true; },
    ...(input.observeTest ? { observed: input.observeTest } : {}),
    ...(input.signal ? { signal: input.signal } : {})
  });
  // The state every decision handler reads and writes (`decision-handlers/types.ts`).
  const handling: AutomationStudioLlmEvidenceDecisionHandlerContext = {
    input, limits, trace, accounting, draftSteps, amendmentMemory, noProgress, evidence, toolIds, toolsById, observeToolFailures, counters,
    history, draftRevision: () => rows.draftRevision, lastAction: undefined, dryRunSeen: { ran: false }, reaskedRequests: new Set(), callStates: new Map(), repeats: automationStudioLlmEvidenceRepeatGuard(), looks,
    recordRow, draftRecord, accountEvidence, unusable, dryRun, authored
  };
  // One call run and recorded, whoever decided it: the model's tool call, or the
  // arrival the loop makes for it before its first decision (below), recorded
  // exactly as that call added at iteration 0 would be. Nothing returned means
  // the loop goes on; a result is how it ends.
  type ToolCall = Extract<AutomationStudioLlmEvidenceLoopDecision, { kind: "tool_call" }>;
  const runCall = async (iteration: number, callId: string, decision: ToolCall, tool: AutomationStudioLlmEvidenceTool, toolRequestSignature: string, rerun: {
    replaces?: AutomationStudioFlowDraftStep | undefined; held?: AutomationStudioLlmEvidenceRerunHeld | undefined; verifying?: Extract<AutomationStudioLlmEvidenceAnswerCheckOutcome, { kind: "verify" }> | undefined
  } = {}): Promise<AutomationStudioLlmEvidenceLoopResult | undefined> => {
    const { replaces: rerunReplaces, held: rerunHeld, verifying } = rerun;
    callIds.add(callId);
    answeredRequests.set(toolRequestSignature, callId);
    let execution: ReturnType<typeof automationStudioLlmEvidenceParseToolExecutionResult> | "threw";
    // Kept so a result that is not one can be refused by name (`./tool-failure.ts`).
    let ran: Awaited<ReturnType<typeof input.executeTool>> | undefined;
    let stateBefore: string | undefined;
    let stateAfter: string | undefined;
    const words = automationStudioFlowDraftStepWordsOf(input.describeCall, { toolId: decision.toolId, value: decision.input }); // Asked before the call: a click that closes its popup leaves its handle naming nothing (`../flow-draft/step-words.ts`).
    try {
      // A rerun runs from its step's own page, never from where the last call left it (`./node-tools/step-place.ts`).
      const place = rerunReplaces ? await automationStudioNodeRerunFromItsPlace({ step: rerunReplaces, steps: draftSteps, now: handling.repeats.state(), callId, executeTool: input.executeTool, signal: input.signal }) : undefined;
      stateBefore = await digest(callId, decision.toolId);
      // The rerun's answer says where it ran (`rerunPlace`): run `run-muqk713g`'s re-author reran a seeded read on the
      // results page the refuted run left, and nothing said so (C6).
      ran = place?.kind === "unreachable" ? place.result : automationStudioNodeRerunPlaceNoted(place, await input.executeTool({ callId, toolId: decision.toolId, value: decision.input, ...(input.signal ? { signal: input.signal } : {}) }));
      stateAfter = await digest(callId, decision.toolId);
      execution = automationStudioLlmEvidenceParseToolExecutionResult(ran, tool.effect);
    } catch {
      execution = "threw";
    }
    if (execution === "threw" || !execution) {
      // Nothing answered the request, so asking it again is not a repeat.
      answeredRequests.delete(toolRequestSignature);
      if (rerunHeld) automationStudioLlmEvidenceSettleHeldAmendments(handling, iteration, rerunHeld, undefined);
      const next = automationStudioLlmEvidenceHandleFailedCall(handling, iteration, callId, tool, execution ? "llm_evidence_loop.tool_failed" : automationStudioLlmEvidenceToolResultInvalidCode(ran, tool.effect) ?? "llm_evidence_loop.tool_result_invalid", decision.input, decision.usage, stateBefore, toolRequestSignature);
      return next.kind === "end" ? next.result : undefined;
    }
    ({ before: stateBefore, after: stateAfter } = statesOf(execution, stateBefore, stateAfter));
    const { evidence: value, effectApplied, resultCode } = execution;
    const evidenceBytes = Buffer.byteLength(JSON.stringify(value), "utf8");
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
    if (stateAfter !== undefined) handling.callStates.set(callId, stateAfter);
    // An action this build saw only look and propose nothing: what withdrawal withholds.
    if (record.effect === "observe" && record.proposes === false) looks.sawLook(tool.toolId, record.actionId);
    if (record.effect === "mutate") { counters.attemptEpoch += 1; if (effectApplied) counters.mutationEpoch += 1; }
    // What this call did on the page it found: a call that failed or changed nothing is not made again there (`repeat-guard/outcomes.ts`).
    handling.repeats.recorded({ callId, toolId: decision.toolId, input: decision.input, stateBefore, stateAfter, effect: record.effect, proposes: record.proposes ?? record.effect === "mutate", effectApplied, refused: typeof value === "object" && value !== null && !Array.isArray(value) && value.ok === false, resultCode, resultReason: execution.resultReason, answer: JSON.stringify(value) });
    if (!lookRefused && automationStudioLlmEvidenceLookNeedsAttempt(tool, mutableTools)) {
      observationEpochs.set(tool.toolId, counters.attemptEpoch);
      latestObservations.set(tool.toolId, callId);
    }
    // A call ran, so a note about an earlier answer from memory or an unusable reply
    // is about a moment the build has left; its trace is the history row.
    automationStudioLlmDecisionContextSupersede(evidence, AUTOMATION_STUDIO_LLM_EVIDENCE_REQUEST_CHECK_TOOL_ID, AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID, AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_CHECK_TOOL_ID);
    evidence.push({ callId, toolId: decision.toolId, value });
    const refusedCall = typeof value === "object" && value !== null && !Array.isArray(value) && value.ok === false;
    history.record(iteration, {
      // The request as the repeat policy keys it -- what was asked, in the state it was asked
      // in -- so a request answered from memory is the same decision as the call it repeats,
      // and the same request after an action is a new one (`./repeat-policy.ts`).
      kind: "call", signature: toolRequestSignature, callId, toolId: decision.toolId, ...(record.actionId !== decision.toolId ? { actionId: record.actionId } : {}),
      resultCode: resultCode ?? "ok", changed: record.effect === "mutate" && effectApplied ? "yes" : "no", ...(refusedCall ? { refused: true } : {})
    });
    if (record.effect === "mutate") handling.lastAction = { callId, iteration };
    const draftChanged = draftRecord({ iteration, callId, ...record, ...(words ? { words } : {}), effectApplied, ...(resultCode ? { resultCode } : {}), ...(stateBefore !== undefined && stateAfter !== undefined ? { stateBefore, stateAfter } : {}) }, { add: decision.add, act: decision.act });
    automationStudioLlmEvidenceRerunReplaced(draftSteps, rerunReplaces, { takesItsPlace: authoring });
    const settled = rerunHeld ? automationStudioLlmEvidenceSettleHeldAmendments(handling, iteration, rerunHeld, draftSteps.find((step) => step.callId === callId)) : {};
    // Whether this call's step is now in the Flow the model authors: added as it ran, or a rerun standing in for a step that was.
    const addedToFlow = authored?.advanced() === true;
    const pageState: AutomationStudioLlmEvidenceLoopProgress["pageState"] = stateBefore === undefined || stateAfter === undefined
      ? "unobserved"
      : stateBefore === stateAfter ? "unchanged" : "changed";
    recordRow(
      { iteration, decision: "tool_call", callId, toolId: decision.toolId, evidenceBytes, ...settled, ...(record.effect === "mutate" ? { effectApplied } : {}), ...(resultCode ? { resultCode } : {}), ...callDiagnostic(execution), ...(decision.usage ? { usage: decision.usage } : {}) },
      { draftChanged, pageState }
    );
    // **What the loop learned, not what it ran.** The whole rule -- the four
    // ways of learning nothing, why a refused look counts, why a repeat that
    // announces itself needs the caller to say so, and the live runs each was
    // measured on -- is in `./evidence-progress/no-progress.ts`. A call that
    // changed something is always progress; anything else whose answer is the
    // one its own tool already gave is not, whatever its code says.
    const repeated = noProgress.answerRepeats({
      toolId: decision.toolId,
      answer: JSON.stringify(value),
      // The caller's statement about *this* call, not its tool's standing
      // declaration, which is what lets one tool run a whole library.
      mutated: record.effect === "mutate" && effectApplied,
      stateAfter,
      ...(execution.repeatedAnswer === undefined ? {} : { repeatedAnswer: execution.repeatedAnswer })
    });
    // A look asked again and run once more: the same page is a step without
    // progress whatever its bytes, and a page that moved by itself is progress.
    const reask = verifying ? automationStudioLlmEvidenceReaskOutcome(verifying, { stateAfter, refused: lookRefused }) : undefined;
    // A step the model added to its Flow is the draft advancing, wherever the page went.
    if (addedToFlow || (!automationStudioLlmEvidenceNothingHappened({ evidence: value, effectApplied }) && (reask === "moved" || (reask !== "repeat" && !repeated)))) {
      // Progress: a redirect about steps without it no longer holds.
      noProgress.cleared();
      automationStudioLlmDecisionContextSupersede(evidence, AUTOMATION_STUDIO_LLM_EVIDENCE_NO_PROGRESS_TOOL_ID);
    } else {
      noProgress.stepped(decision.toolId);
      if (noProgress.reached()) return failure(draftSteps, "llm_evidence_loop.repeat_without_progress", trace, accounting);
      if (reask === "repeat") {
        automationStudioLlmEvidenceShowVerifiedRepeat(handling, { iteration, callId, toolId: decision.toolId, answeredByCallId: verifying!.answeredByCallId, requestSignature: toolRequestSignature });
        automationStudioLlmEvidenceAskedAgain(handling, iteration);
      }
      noProgress.redirect(iteration);
    }
    // Looks in a row with nothing done between: told at five, the round stalled at eight (`decision-handlers/searching.ts`).
    const searching = automationStudioLlmEvidenceSearchingWithoutActing(handling, iteration);
    if (searching?.kind === "end") return searching.result;
    if (searching) { if (input.propagateDecisionErrors) throw searching.error; return failure(draftSteps, "llm_evidence_loop.repeat_without_progress", trace, accounting); }
    return undefined;
  };
  const initialTool = input.tools.find((tool) => tool.initialObservation);
  // A draft already holding the Flow (a repair's, a re-author's) opens with the look where the test left the page, never the arrival (run 38 C3), and
  // the look carries the Flow's calls as written under `held`, so the domain keeps where the build arrived and the addresses it held (C8).
  const held = draftSteps.some((step) => step.disposition === "kept") ? draftSteps.filter((step) => step.disposition === "kept" && (step.toolId ?? step.actionId) === initialTool?.toolId).map((step) => structuredClone(step.input)) : undefined;
  const arrival = held ? undefined : initialTool?.initialObservation!.arrival;
  if (initialTool && arrival) {
    // A build told where its Flow starts opens by going there (F31): its look was refused for not being there yet, and the model's first paid
    // decision was that navigation (`run-muqc07fh-eeffbc86`). The opening call id stays, since the domain keys per-build memory on it. No provider call.
    if (input.signal?.aborted) return failure(draftSteps, "llm_evidence_loop.cancelled", trace, accounting);
    const opening: ToolCall = { kind: "tool_call", callId: `initial.${initialTool.toolId}`, toolId: initialTool.toolId, input: structuredClone(arrival), add: true };
    const ended = await runCall(0, opening.callId, opening, initialTool, automationStudioLlmEvidenceRequestSignature({ tool: initialTool, mutationEpoch: counters.mutationEpoch, attemptEpoch: counters.attemptEpoch, input: opening.input }));
    if (ended) return ended;
  } else if (initialTool) {
    const initialInput = initialTool.initialObservation!.input;
    if (input.signal?.aborted) return failure(draftSteps, "llm_evidence_loop.cancelled", trace, accounting);
    const callId = `initial.${initialTool.toolId}`;
    callIds.add(callId);
    let execution: ReturnType<typeof automationStudioLlmEvidenceParseToolExecutionResult> | "threw";
    // Kept so a result that is not one can be refused by name (`./tool-failure.ts`).
    let ran: Awaited<ReturnType<typeof input.executeTool>> | undefined;
    let stateBefore: string | undefined;
    let stateAfter: string | undefined;
    try {
      stateBefore = await digest(callId, initialTool.toolId);
      execution = automationStudioLlmEvidenceParseToolExecutionResult(ran = await input.executeTool({ callId, toolId: initialTool.toolId, value: structuredClone(held ? { ...initialInput, held } : initialInput), ...(input.signal ? { signal: input.signal } : {}) }), initialTool.effect);
      stateAfter = await digest(callId, initialTool.toolId);
      if (execution) ({ before: stateBefore, after: stateAfter } = statesOf(execution, stateBefore, stateAfter));
    } catch {
      execution = "threw";
    }
    if (execution === "threw" || !execution) {
      // Recorded like any failed call; the observation, never made, stays offered.
      const next = automationStudioLlmEvidenceHandleFailedCall(handling, 0, callId, initialTool, execution ? "llm_evidence_loop.tool_failed" : automationStudioLlmEvidenceToolResultInvalidCode(ran, initialTool.effect) ?? "llm_evidence_loop.tool_result_invalid", initialInput, undefined, stateBefore);
      if (next.kind === "end") return next.result;
    } else {
      const evidenceBytes = Buffer.byteLength(JSON.stringify(execution.evidence), "utf8");
      accounting.toolCalls = 1;
      accounting.evidenceBytes = evidenceBytes;
      // A free first look that was refused looked at nothing, so it is not
      // filed as this epoch's answer or as this tool's observation -- the same
      // rule the loop applies to every later call (`repeat-policy.ts`). Filing
      // it would make the model's first decision a repeat before it had been
      // shown anything. The host wrote this call's argument and is answerable
      // for it being a look, so it is judged as one whatever the tool declares.
      if (!automationStudioLlmEvidenceLookWasRefused({ evidence: execution.evidence, effect: "observe", effectApplied: execution.effectApplied })) {
        answeredRequests.set(automationStudioLlmEvidenceCanonicalJson([counters.mutationEpoch, initialTool.toolId, initialInput]), callId);
        observationEpochs.set(initialTool.toolId, counters.attemptEpoch);
        latestObservations.set(initialTool.toolId, callId);
        if (stateAfter !== undefined) { handling.callStates.set(callId, stateAfter); handling.repeats.seen(stateAfter); }
      }
      const initialRecord = callRecord(initialTool, initialInput, execution);
      if (initialRecord.effect === "observe" && initialRecord.proposes === false) looks.sawLook(initialTool.toolId, initialRecord.actionId);
      evidence.push({ callId, toolId: initialTool.toolId, value: execution.evidence });
      const lookRefusedItself = typeof execution.evidence === "object" && execution.evidence !== null && !Array.isArray(execution.evidence) && execution.evidence.ok === false;
      history.record(0, { kind: "look", callId, toolId: initialTool.toolId, resultCode: execution.resultCode ?? "ok", ...(lookRefusedItself ? { refused: true } : {}) });
      // The free look is this tool's last answer as much as any other call is,
      // so a first decision that asks for it again and gets the same bytes back
      // is a step without progress rather than the loop's first step.
      noProgress.answered(initialTool.toolId, JSON.stringify(execution.evidence));
      const draftChanged = draftRecord({ iteration: 0, callId, ...initialRecord, effect: "observe", effectApplied: false, ...(execution.resultCode ? { resultCode: execution.resultCode } : {}) });
      const pageState: AutomationStudioLlmEvidenceLoopProgress["pageState"] = stateBefore === undefined || stateAfter === undefined
        ? "unobserved"
        : stateBefore === stateAfter ? "unchanged" : "changed";
      recordRow({ iteration: 0, decision: "tool_call", callId, toolId: initialTool.toolId, evidenceBytes, ...(execution.resultCode ? { resultCode: execution.resultCode } : {}), ...callDiagnostic(execution) }, { draftChanged, pageState });
    }
  }
  // A continuation: told what it owes, and carried on live from where the page
  // stands. Its draft is not replayed from the first step: nothing in a build's
  // live phase is, and the Flow is tested once, when the model says it is ready
  // (`./evidence-loop/resume.ts`, `./evidence-loop/completion-attempt.ts`).
  const resume = input.draft === false ? undefined : input.draft?.resume;
  if (resume) {
    const resumed = automationStudioLlmEvidenceResumeEntry(resume, draftSteps);
    accountEvidence(resumed.value);
    evidence.push(resumed);
  }
  for (let iteration = 1; iteration <= limits.maxIterations; iteration += 1) {
    if (input.signal?.aborted) return failure(draftSteps, "llm_evidence_loop.cancelled", trace, accounting);
    accounting.iterations = iteration;
    rows.draftShown = undefined;
    let decision: AutomationStudioLlmEvidenceLoopDecision | undefined;
    let canAmend = false;
    // Whether this iteration's call is a step the model asked to run again, which
    // is never a repeat however identical it looks, and the step it replaces.
    let rerunning = false;
    let rerunReplaces: AutomationStudioFlowDraftStep | undefined;
    let rerunHeld: AutomationStudioLlmEvidenceRerunHeld | undefined;
    // A look asked again for the first time, run to see whether the page is as its answer left it (`decision-handlers/answer-check.ts`).
    let verifying: Extract<AutomationStudioLlmEvidenceAnswerCheckOutcome, { kind: "verify" }> | undefined;
    // What may be offered, with looks withdrawn after an ignored redirect.
    const eligibleTools = looks.offer(input.tools.filter((tool) =>
      !automationStudioLlmEvidenceLookNeedsAttempt(tool, mutableTools) || observationEpochs.get(tool.toolId) !== counters.attemptEpoch
    ), counters.attemptEpoch);
    const eligibleToolIds = new Set(eligibleTools.map((tool) => tool.toolId));
    const canComplete = accounting.toolCalls - counters.failedToolCalls >= limits.minToolCalls;
    offeredCompletion = canComplete;
    if (!eligibleTools.length && !canComplete) return failure(draftSteps, "llm_evidence_loop.repeat_without_progress", trace, accounting);
    // What the budget leaves (`loop-budget.ts`), cost read from the purse in use:
    // told to the model as the newest entry, and a last decision offered only completion.
    const purseFigures = purse.figures();
    const remaining = input.budget && automationStudioLlmEvidenceLoopRemaining(input.budget, {
      decisions: iteration - 1, reportedDecisions, totalTokens: accounting.totalTokens, estimatedCostUsd: accounting.estimatedCostUsd, elapsedMs: clock() - startedAtMs,
      ...(purse.lastProjectedCostUsd !== undefined ? { nextDecisionCostUsd: purse.lastProjectedCostUsd } : {}), ...(purseFigures ? { purse: purseFigures } : {})
    }, limits.maxIterations - iteration + 1);
    // No decision left for tokens or time (cost never counts to none: the purse decides). The budget is what
    // ran out, which a retry raises; what the last decision happened to be is recorded beside it, not the ending.
    lastRemaining = remaining || undefined;
    if (remaining && remaining.decisionsLeft === 0) { accounting.iterations = iteration - 1; return exhausted("budget"); } // This decision was never asked for, so it is not counted.
    finalDecision = remaining !== undefined && remaining.decisionsLeft === 1 && canComplete;
    // The wrap-up (`./loop-budget.ts`): the last few decisions offer finishing
    // and amending, so a refused completion still has turns to be answered in.
    const wrappingUp = remaining !== undefined && remaining.decisionsLeft <= AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_WRAP_UP_DECISIONS && canComplete;
    const offered = wrappingUp ? [] : eligibleTools;
    const offers = (): AutomationStudioLlmUnusableDecisionOffers => ({ tools: offered.length > 0, complete: canComplete, amend: canAmend });
    // A reply read and still not a decision this iteration offered (`./evidence-loop/decision-refusal.ts`).
    let refusal: ReturnType<typeof automationStudioLlmEvidenceDecisionRefusal> = undefined;
    try {
      canAmend = drafting && !finalDecision && counters.draftAmendments < limits.maxDraftAmendments && draftSteps.some(automationStudioFlowDraftStepIsProposable);
      const decisionSchema = buildAutomationStudioLlmEvidenceLoopDecisionSchema(offered, input.completionSchema, canComplete, canAmend, drafting && authoring);
      // From the second decision, when there is spending to measure it by; the first only when it is the last.
      const budgetEntry = remaining && (iteration > 1 || wrappingUp) ? automationStudioLlmEvidenceBudgetEntry(iteration, remaining, wrappingUp) : undefined;
      // Every evidence entry, and beside them the history, the draft and the
      // budget, each whole; the draft measured as it goes out
      // (`decision-context/shown.ts` says why each is where it is).
      const decisionContext = automationStudioLlmDecisionContextShown({
        evidence, records: history.records(), budgetEntry, observedStateKeys: input.observedStateKeys,
        draft: drafting ? { steps: draftSteps, authored: authoring, acts: input.draft ? input.draft.acts?.(draftSteps) : undefined } : undefined
      });
      rows.draftShown = decisionContext.draftShown;
      const shown = decisionContext.shown;
      noProgress.shown(shown.map((entry) => entry.callId));
      const raw = await purse.run(() => input.decide({ iteration, tools: offered, evidence: shown, decisionSchema, canComplete, ...(input.signal ? { signal: input.signal } : {}) }));
      unreadable.readable();
      unanswered.answered();
      decision = automationStudioLlmEvidenceParseDecision(raw);
      refusal = input.unusableDecisions ? automationStudioLlmEvidenceDecisionRefusal(raw, decision, { complete: canComplete, amend: canAmend }) : undefined;
    } catch (thrown) { const costRefusal = purse.refused(thrown); if (costRefusal) { accounting.iterations = iteration - 1; return exhausted("budget", costRefusal); } // Not sent: the purse could not pay for it at worst, the only cost ending.
      if (input.signal?.aborted) return failure(draftSteps, "llm_evidence_loop.cancelled", trace, accounting);
      let error = thrown;
      if (input.unusableDecisions && thrown instanceof AutomationStudioLlmUnusableDecisionError && automationStudioLlmProviderUnanswered(thrown.issueCodes)) {
        recordRow({ iteration, decision: "unusable", resultCode: thrown.issueCodes[0]! });
        if (!unanswered.unanswered(thrown.issueCodes[0]!)) continue;
        return failure(draftSteps, "llm_evidence_loop.provider_unavailable", trace, accounting, undefined, undefined, unanswered.summary());
      }
      if (input.unusableDecisions && thrown instanceof AutomationStudioLlmUnusableDecisionError) {
        unanswered.answered(); // A reply arrived, unusable or not.
        // A reply that arrived unreadable was still paid for: its cost counts,
        // and its row says which malformed case it was (`./unusable-decision.ts`).
        automationStudioLlmEvidenceLoopAddUsage(accounting, thrown.reply?.usage);
        if (thrown.reply?.usage) reportedDecisions += 1;
        if (automationStudioLlmReplyUnreadable(thrown.issueCodes)) {
          const asked = unreadableReply(iteration, thrown, offers());
          if (asked === "ask_again") continue;
          return asked;
        }
        unreadable.readable();
        const refused = refuseDecision(iteration, thrown.issueCodes, offers(), thrown.reply?.usage, thrown.reply?.case);
        if (refused === "ask_again") continue;
        error = refused.error;
      }
      if (input.propagateDecisionErrors) throw error;
    }
    if (refusal) { // Read and paid for, and not a decision this iteration can act on: asked again, never an ending of its own.
      const usage = refusal.usage ?? decision?.usage;
      automationStudioLlmEvidenceLoopAddUsage(accounting, usage);
      if (usage) reportedDecisions += 1;
      const refused = refuseDecision(iteration, refusal.issueCodes, offers(), usage);
      if (refused === "ask_again") continue;
      if (input.propagateDecisionErrors) throw refused.error;
      return failure(draftSteps, "llm_evidence_loop.invalid_decision", trace, accounting);
    }
    if (!decision) return failure(draftSteps, "llm_evidence_loop.invalid_decision", trace, accounting);
    automationStudioLlmEvidenceLoopAddUsage(accounting, decision.usage);
    if (decision.usage) reportedDecisions += 1;
    if (decision.kind === "complete") {
      const next = await automationStudioLlmEvidenceHandleCompletion(handling, iteration, decision);
      if (next.kind === "end") return next.result;
      continue;
    }
    if (decision.kind === "amend_draft") {
      const next = automationStudioLlmEvidenceHandleAmendment(handling, iteration, decision, canAmend);
      if (next.kind === "end") return next.result;
      if (next.kind === "continue") continue;
      // From here the rerun is an ordinary call -- the same budget, the same
      // digests, the same draft entry -- with one exception, below: it is not a
      // repeat. The model has just said to do this again, and answering it from
      // the result already held is how a live build spent seven decisions
      // asking for the same rerun and getting `already_answered` each time
      // (`run-mud9rpmz-16de647b`).
      rerunning = true;
      rerunReplaces = next.replaces; rerunHeld = next.held;
      decision = next.decision;
    }
    // A look withdrawn after an ignored redirect, asked for anyway: refused as
    // an unusable decision -- never run, and never answered from memory, which
    // is the move being taken away (`decision-handlers/look-withdrawal.ts`).
    const asked = rerunning ? undefined : toolsById.get(decision.toolId);
    if (asked && looks.refuses(asked, decision.input, counters.attemptEpoch)) {
      const issueCodes = [AUTOMATION_STUDIO_LLM_EVIDENCE_LOOK_WITHDRAWN_CODE];
      // Registered first, so it is always one more step of the run without
      // progress it belongs to rather than the first step of a new one.
      noProgress.sameIssuesAgain(automationStudioLlmUnusableDecisionIssueSet(issueCodes));
      // The one that reaches the no-progress guard ends the loop as the repeat
      // it is -- the ending the answers from memory before it were heading for
      // -- rather than as a stalled run of replies Core could not read.
      if (noProgress.steps + 1 >= limits.maxStepsWithoutProgress) {
        history.record(iteration, { kind: "unusable", signature: automationStudioLlmDecisionContextSignature({ kind: "unusable", issueCodes }), issueCodes });
        noProgress.stepped();
        recordRow({ iteration, decision: "unusable", resultCode: issueCodes[0]!, ...(decision.usage ? { usage: decision.usage } : {}) });
        return failure(draftSteps, "llm_evidence_loop.repeat_without_progress", trace, accounting);
      }
      const refused = refuseDecision(iteration, issueCodes, { tools: offered.length > 0, complete: canComplete, amend: canAmend }, decision.usage);
      if (refused === "ask_again") continue;
      if (input.propagateDecisionErrors) throw refused.error;
      return failure(draftSteps, "llm_evidence_loop.invalid_decision", trace, accounting);
    }
    counters.unusableInARow = 0;
    // The last decision the budget allowed was offered only completion, and was
    // spent on something else. The budget is still what ran out, and the paid decision leaves its row (`./evidence-loop/final-decision-row.ts`).
    // Not when cost is the bound: its count only informs, so the loop carries on and the purse decides.
    if (finalDecision && remaining && remaining.limitedBy !== "cost") { recordRow(automationStudioLlmEvidenceFinalDecisionRow(iteration, decision, toolIds)); return exhausted("budget"); }
    if (!toolIds.has(decision.toolId)) return failure(draftSteps, "llm_evidence_loop.unknown_tool", trace, accounting);
    // A repeat is answered from what the loop already holds. Checked before the
    // call id, so a request repeated word for word is a repeat, not a clash.
    const tool = toolsById.get(decision.toolId)!;
    const toolRequestSignature = automationStudioLlmEvidenceRequestSignature({ tool, mutationEpoch: counters.mutationEpoch, attemptEpoch: counters.attemptEpoch, input: decision.input });
    const answeredBy = answeredRequests.get(toolRequestSignature);
    // Not offered this iteration: an observation nothing has happened since (its latest call is always recorded with its epoch),
    // or, in the wrap-up, any tool at all -- the wrap-up offers none, and a call it was not offered is answered, never run.
    const reobservation = !eligibleToolIds.has(decision.toolId);
    // The same call that already failed or changed nothing on this same page is
    // refused unrun, before the repeat policy runs it again, so every action repeat
    // is refused in one place and stalls the round at the third in a row; a look
    // that answered the same twice here is too, unless the policy answers it from memory (`repeat-guard/outcomes.ts`).
    const blocked = wrappingUp ? undefined : handling.repeats.blocks(decision.toolId, decision.input);
    const triedHere = blocked?.outcome === "same_answer" && (answeredBy !== undefined || reobservation) ? undefined : blocked;
    if (triedHere) {
      const next = automationStudioLlmEvidenceHandleRefusedRepeat(handling, iteration, decision, triedHere);
      if (next.kind === "stalled") { if (input.propagateDecisionErrors) throw next.error; return failure(draftSteps, "llm_evidence_loop.repeat_without_progress", trace, accounting); }
      if (next.kind === "end") return next.result;
      continue;
    }
    if (!rerunning && (answeredBy !== undefined || reobservation || wrappingUp)) {
      const code = wrappingUp ? "llm_evidence_loop.not_offered" : answeredBy !== undefined ? "llm_evidence_loop.already_answered" : "llm_evidence_loop.already_observed";
      const by = wrappingUp ? latestObservations.get(decision.toolId) ?? "" : answeredBy ?? latestObservations.get(decision.toolId)!;
      // A look asked again for the first time is run once more, to see whether
      // the page is as its answer left it; every other repeat is answered from
      // memory, with no capture (`decision-handlers/answer-check.ts`).
      const check: AutomationStudioLlmEvidenceAnswerCheckOutcome = wrappingUp ? { kind: "answer" } : automationStudioLlmEvidenceAnswerCheck(handling, { answeredByCallId: by, requestSignature: toolRequestSignature });
      if (check.kind === "answer") {
        const next = automationStudioLlmEvidenceHandleAnsweredRequest(handling, iteration, decision, code, by, toolRequestSignature);
        if (next.kind === "end") return next.result;
        continue;
      }
      verifying = check;
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
    const ended = await runCall(iteration, callId, decision, tool, toolRequestSignature, { replaces: rerunReplaces, held: rerunHeld, verifying });
    if (ended) return ended;
  }
  return exhausted("iterations");
}
