// What a loop may be configured with, and how those numbers resolve.
//
// One module says what a caller may ask for and what each number means;
// `evidence-loop.ts` says what the loop does with them. The split follows the
// one already between the loop and its grammar (`evidence-loop-decision.ts`):
// the contract is long because each field is a decision with a reason behind
// it, and a file that both states the contract and runs on it grows past what
// anyone reads in one sitting.
//
// Everything here is re-exported from `evidence-loop.ts`, so the loop's public
// surface is unchanged and every existing consumer still reads it from there.

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS } from "../loop-limits/index.ts";
import type { AutomationStudioLlmEvidenceLoopBudget } from "./loop-budget.ts";
import { automationStudioLlmEvidenceLoopBudgetValid } from "./loop-budget.ts";
import type { AutomationStudioLlmUsageSummary } from "./harness.ts";
import { AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST } from "./harness/index.ts";
import { automationStudioLlmTokenBudgetBytes } from "./token-estimation.ts";
import type { AutomationStudioFlowDraftStep } from "../flow-draft/index.ts";
import {
  AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_UNUSABLE_DECISIONS_IN_A_ROW,
  type AutomationStudioLlmEvidenceCompletionCheck,
  type AutomationStudioLlmEvidenceLoopAccounting,
  type AutomationStudioLlmEvidenceLoopTrace,
  type AutomationStudioLlmEvidenceTool,
  type AutomationStudioLlmEvidenceToolExecutionResult
} from "./evidence-loop.ts";

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
   * The far backstop on steps in a row that give the loop nothing new.
   *
   * It was three, and three is wrong. A build that meets a setback, looks at
   * the page again and tries another way has taken two steps that gathered
   * nothing new and is doing exactly the right thing; the third ended it. The
   * loop is bounded by what it spends -- cost, tokens, the deadline -- and by
   * genuine progress, and this is only the stop for a loop that is repeating
   * itself and will not stop. It is set well past any ordinary correction, so
   * in normal work it never fires.
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
   * `AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS`,
   * held to `maxIterations`. Given both, they must agree.
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
  checkCompletion?(
    result: JsonObject,
    /** The draft as it stands, so a caller that builds its result from what
     * the loop did rather than from what the model wrote has it to build from. */
    context: { steps: readonly AutomationStudioFlowDraftStep[] }
  ): AutomationStudioLlmEvidenceCompletionCheck | Promise<AutomationStudioLlmEvidenceCompletionCheck>;
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
  /**
   * Whether a completed result must first have its draft replayed clean
   * (`runtime/flow-draft/dry-run.ts`).
   *
   * On by default, and it costs a caller that cannot replay nothing: the gate
   * applies only to a draft whose proposed steps carry what a replay needs, so
   * a host that says nothing about replaying is never held to it. Where it does
   * apply, the target is put back the way the draft's first step found it and
   * every proposed step is run again through `executeTool` -- the same executor,
   * so the same permission gate -- with **no provider call made by any of it**,
   * and a result whose draft did not replay clean is refused back to the model
   * as an ordinary issue rather than proposed.
   *
   * `false` turns it off, which is for a caller whose actions cannot be taken
   * twice, never for making a build finish sooner: the replay is the only thing
   * between "each step worked when I took it" and "these steps work as a Flow".
   */
  dryRun?: false;
  signal?: AbortSignal;
};

export type EvidenceLoopLimits = {
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

export function resolveLimits(input: AutomationStudioLlmEvidenceLoopInput): EvidenceLoopLimits | undefined {
  const maxEvidenceBytes = input.maxEvidenceBytes ?? AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxEvidenceBytes;
  const maxEvidenceContextBytes = input.maxEvidenceContextBytes ?? Math.min(64_000, maxEvidenceBytes);
  const maxIterations = input.maxIterations ?? 8;
  const unusable = input.unusableDecisions;
  const draft = input.draft === false ? undefined : input.draft;
  if (input.maxStepsWithoutProgress !== undefined && unusable?.maxConsecutive !== undefined
    && input.maxStepsWithoutProgress !== unusable.maxConsecutive) return undefined;
  const maxStepsWithoutProgress = input.maxStepsWithoutProgress ?? unusable?.maxConsecutive
    ?? Math.min(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS, maxIterations);
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
    // Editing the draft *is* the authoring, now that the draft is what the
    // result is built from, so an allowance of four was an allowance of four
    // corrections for a whole Flow. The run's own budget is what bounds it.
    maxDraftAmendments: Math.min(draft?.maxAmendments ?? 16, maxIterations)
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

