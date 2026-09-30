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
import {
  AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS,
  AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS,
  AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_REDIRECT_AT_STEPS_WITHOUT_PROGRESS
} from "../loop-limits/index.ts";
import type { AutomationStudioLlmEvidenceLoopBudget } from "./loop-budget.ts";
import { automationStudioLlmEvidenceLoopBudgetValid } from "./loop-budget.ts";
import type { AutomationStudioLlmUsageSummary } from "./harness.ts";
import { AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST } from "./harness/index.ts";
import { automationStudioLlmTokenBudgetBytes } from "./token-estimation.ts";
import type { AutomationStudioFlowDraftStep } from "../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceLoopResume } from "./evidence-loop/index.ts";
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
   *
   * A caller whose results report `stateDigests` from the call's own captures
   * (`evidence-loop/tool-execution.ts`) leaves this out: the loop then reads
   * each call's two states off its result and never asks for one, which is
   * what keeps a look at one capture instead of three. Given, it is asked as
   * before and a result's own digests are not read, so no point in a step is
   * ever digested twice.
   */
  captureStateDigest?(input: { callId: string; toolId: string; signal?: AbortSignal }): Promise<string | undefined> | string | undefined;
  /**
   * `false` keeps every look on offer after an ignored redirect
   * (`decision-handlers/look-withdrawal.ts`). For replaying a build recorded
   * before looks were withdrawn, whose later decisions were made without it;
   * a live loop leaves it out.
   */
  lookWithdrawal?: false;
  /**
   * The draft the loop accrues and shows the model beside its evidence
   * (`runtime/flow-draft/`), with `amend_draft` decisions to correct it.
   * `false` turns both off; `steps` is returned either way. `maxBytes` is what
   * the entry may cost, absent a quarter of the evidence context up to 4,000;
   * `maxAmendments` is how many edits the run may spend, absent four.
   */
  draft?: false | {
    maxBytes?: number;
    maxAmendments?: number;
    /**
     * Steps the draft already holds before the loop takes its first one.
     *
     * This is how a loop is asked to work on a result that exists rather than
     * to write one from nothing: a Flow read back as steps
     * (`node-tools/draft-from-flow.ts`) is handed in here, the model is shown
     * it as its own draft, and every amendment -- drop, reorder, rerun -- edits
     * it. The loop appends to it exactly as it appends to one it filled itself,
     * and `steps` comes back as the whole list.
     *
     * A seeded step is one the loop did not take. It carries the caller's word
     * for whether the result contains it and nothing else: no call id, because
     * no call was made; no replay, so a seeded draft is not dry-run gated; and
     * the caller keeps seeded ids clear of the `d<n>` this loop mints, so an
     * amendment naming a step names one step.
     */
    seed?: readonly AutomationStudioFlowDraftStep[];
    /**
     * The seed is the draft of a build that ran out before it finished, and
     * this build continues it (`../flow-bootstrap/incomplete-draft/`).
     *
     * Before the first decision the model is told what the last build still
     * owed (`./evidence-loop/resume.ts`). The draft is not replayed: a
     * continuation is still the build's live phase, and the model carries on
     * from wherever the page stands (user, 2026-09-30). A seed carried from the
     * loop's own steps keeps their replay, so unlike an extend's seed it is
     * tested like any draft once the model says the Flow is ready.
     */
    resume?: AutomationStudioLlmEvidenceLoopResume;
  };
  /**
   * Whether a completed result must first have its draft replayed clean
   * (`runtime/flow-draft/dry-run.ts`) -- the test of the Flow, asked only once
   * the completion check has accepted it (`./evidence-loop/completion-attempt.ts`).
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

/**
 * The steps a loop starts with, renumbered from 1 whatever the caller numbered
 * them, so what the model is shown and what an amendment names agree however
 * the seed was built. A loop given none starts empty, which is every build that
 * writes a Flow from nothing.
 */
export function automationStudioLlmEvidenceLoopSeedSteps(
  draft: AutomationStudioLlmEvidenceLoopInput["draft"]
): AutomationStudioFlowDraftStep[] {
  return (draft === false ? [] : draft?.seed ?? []).map((step, index) => ({ ...step, position: index + 1 }));
}

export type EvidenceLoopLimits = {
  maxIterations: number;
  maxToolCalls: number;
  maxEvidenceBytes: number;
  maxEvidenceContextBytes: number;
  /** What each tool call is offered: the context window less room for what sits beside it. */
  toolEvidenceBytes: number;
  minToolCalls: number;
  maxStepsWithoutProgress: number;
  /**
   * Steps in a row without progress after which the loop changes what it asks
   * for instead of stopping (`./evidence-loop/stall-redirect.ts`).
   *
   * Always below `maxStepsWithoutProgress`, so the redirection always comes
   * first and stopping is always the last resort. Derived, never configured: a
   * caller that shortens the guard shortens this with it.
   */
  redirectAtStepsWithoutProgress: number;
  maxUnusableDecisionsInARow: number;
  /** What the draft entry beside the window may cost. */
  draftBytes: number;
  /** Amendment decisions the run may spend before the kind is withdrawn. */
  maxDraftAmendments: number;
};

/**
 * The fewest bytes in which the draft entry can do its least useful job: list
 * one step with the argument it ran with, and say in full how to correct it
 * (`../flow-draft/entry.ts`).
 *
 * Measured rather than chosen. One step told in full costs 1,221 bytes and one
 * carrying a realistic argument 1,256, so a budget under this cannot hold the
 * guidance and the record at once; this is the round number just above it.
 *
 * Below it the entry still comes back -- a shrinking draft is still a draft --
 * but it comes back with the 154-character telling in place of the
 * 1,047-character one, and until 2026-09-26 that trade was made in silence.
 * `maxEvidenceContextBytes` is admitted from 1,024 up and the draft's share is a
 * quarter of it, so any context under 5,120 derives a budget beneath this floor
 * and nothing said a word about it; before t157 the same arithmetic returned no
 * draft at all, which the caller reads as "this build has taken no action yet".
 *
 * The two ways of arriving under the floor are answered differently, and
 * deliberately. A caller that *names* `draft.maxBytes` under it is refused
 * (`llm_evidence_loop.invalid_configuration`): it wrote a number for the draft
 * itself, so there is nothing to derive and nothing to trade off, and a build
 * whose amendments are guesses is worse than a build that does not start. A
 * budget *derived* from a small context is admitted, because refusing a run
 * outright over a tunable is its own harm -- and every row the run records says
 * what the draft cost and that its budget was under the floor
 * (`./evidence-loop/draft-shown.ts`), so the degradation is named where a reader
 * of the run looks rather than guessed at afterwards.
 */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_MIN_DRAFT_BYTES = 1_280;

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
    // One below the guard at the tightest, so a loop configured to stop at two
    // still says so before it stops, and a loop that cannot redirect before it
    // stops is one nobody can configure.
    redirectAtStepsWithoutProgress: Math.max(1, Math.min(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_REDIRECT_AT_STEPS_WITHOUT_PROGRESS, maxStepsWithoutProgress - 1)),
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
  // A named draft budget too small to show a draft properly is a mistake only a
  // person can have written, so it is caught at the door rather than paid for a
  // provider call at a time. The derived budget is left alone; see the floor's
  // own note above for why the two are answered differently.
  if (draft?.maxBytes !== undefined && draft.maxBytes < AUTOMATION_STUDIO_LLM_EVIDENCE_MIN_DRAFT_BYTES) return undefined;
  if (!Number.isInteger(limits.maxDraftAmendments) || limits.maxDraftAmendments < 0 || limits.maxDraftAmendments > limits.maxIterations) return undefined;
  return limits;
}

