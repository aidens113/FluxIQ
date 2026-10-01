// Running the whole draft again, once, with nothing attached to it.
//
// The reset, then every step the draft proposes, in order, each through the
// same executor an ordinary tool call goes through -- so each one passes the
// same permission gate, and none of them reaches a provider. A step whose
// effect lasts is checked rather than run again, and the steps after it are
// still run (`../../flow-draft/verify-only.ts`). The loop keeps its
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
// **A step that comes back unreadable is a failed step**, never a skipped one.
// A host that does not implement the replay answers something this cannot read,
// and the honest reading of that is "this step was not demonstrably run again",
// which refuses the proposal rather than waving it through.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import {
  automationStudioFlowDraftConditionalStepIds,
  automationStudioFlowDraftDryRunVerdict,
  automationStudioFlowDraftReplayFrom,
  automationStudioFlowDraftReplayOutcomeVerified,
  automationStudioFlowDraftReplayOutcomeWord,
  automationStudioFlowDraftStepId,
  automationStudioFlowDraftStepIsProposed,
  automationStudioFlowDraftStepReplayMode,
  automationStudioFlowDraftStepWithholdsLater,
  automationStudioFlowDraftWithheldStepIds,
  type AutomationStudioFlowDraftDryRun,
  type AutomationStudioFlowDraftReplayMode,
  type AutomationStudioFlowDraftReplayOutcome,
  type AutomationStudioFlowDraftStep
} from "../../flow-draft/index.ts";
import { automationStudioLlmEvidenceParseToolExecutionResult } from "../evidence-loop-decision.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../evidence-loop.ts";
import {
  AUTOMATION_STUDIO_NODE_REPLAY_KEY,
  AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES,
  automationStudioNodeReplayResetCall,
  automationStudioNodeReplayStatus,
  automationStudioNodeReplayStepCall,
  automationStudioNodeReplayToolId,
  automationStudioNodeReplayVerifyCall
} from "./replay.ts";

/** What the caller has to lend a replay: the executor. */
export type AutomationStudioFlowDraftReplayInput = {
  steps: readonly AutomationStudioFlowDraftStep[];
  /** 1 for the first replay of this build. */
  attempt: number;
  executeTool(input: { callId: string; toolId: string; value: JsonObject; signal?: AbortSignal }): Promise<JsonValue | AutomationStudioLlmEvidenceToolExecutionResult>;
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
  const from = automationStudioFlowDraftReplayFrom(input.steps);
  const outcomes: AutomationStudioFlowDraftReplayOutcome[] = [];
  const first = proposed[0];
  if (!from || !first) return { verdict: verdictOf(input, "failed", outcomes) };
  const resetCallId = `dryrun.${input.attempt}.reset`;
  const reset = await call(input, resetCallId, automationStudioNodeReplayToolId(first), automationStudioNodeReplayResetCall(from));
  if (!reset.readable || reset.result.resultCode === AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES.resetFailed || reset.result.effectApplied !== true) {
    return {
      verdict: verdictOf(input, "failed", outcomes),
      ...(reset.readable ? { evidence: { callId: resetCallId, toolId: automationStudioNodeReplayToolId(first), value: reset.result.evidence } } : {})
    };
  }
  let evidence: AutomationStudioFlowDraftReplayResult["evidence"];
  // The first verified step whose withheld effect a later step may have
  // needed: one that moved the target, or one a person is asked about, which a
  // dry run never performs. A later step that does not replay is marked with
  // it and does not refuse on its own (`../../flow-draft/verify-only.ts`).
  let withheldBy: number | undefined;
  const conditional = automationStudioFlowDraftConditionalStepIds(input.steps);
  for (const [index, step] of proposed.entries()) {
    const mode = automationStudioFlowDraftStepReplayMode(step);
    const value = mode === "verify" ? automationStudioNodeReplayVerifyCall(step) : automationStudioNodeReplayStepCall(step);
    const callId = `dryrun.${input.attempt}.${step.position}`;
    const toolId = automationStudioNodeReplayToolId(step);
    const stepId = automationStudioFlowDraftStepId(step);
    // A step with nothing to run it with is a failed step, not a skipped one.
    let ran: ReplayAnswer = value ? await call(input, callId, toolId, value) : { readable: false };
    let status = statusOf(ran, mode);
    let reanchored = false;
    const previous = outcomes.at(-1);
    if (value && status === "unreproducible" && withheldBy === undefined && !conditional.has(stepId) && previous && leftUndone(previous, conditional)) {
      const again = await reanchor(input, step, callId, toolId, value);
      if (again) {
        ran = again;
        status = statusOf(ran, mode);
        reanchored = true;
      }
    }
    const outcome: AutomationStudioFlowDraftReplayOutcome = {
      step: step.position,
      stepId,
      actionId: step.actionId,
      status,
      ...(ran.readable && ran.result.resultCode ? { resultCode: ran.result.resultCode } : {}),
      ...(mode === "verify" ? { mode } : {}),
      ...(status !== "replayed" && withheldBy !== undefined ? { withheldBy } : {}),
      ...(reanchored ? { reanchored: true as const } : {})
    };
    outcomes.push(outcome);
    if (withheldBy === undefined && automationStudioFlowDraftReplayOutcomeVerified(outcome) && automationStudioFlowDraftStepWithholdsLater(step, proposed[index + 1])) {
      withheldBy = step.position;
    }
    if (status === "replayed") continue;
    // The first thing that did not replay is the one worth showing, and the
    // rest of the steps are still run: a verdict that stops at the first
    // failure cannot tell one broken step from a draft that stopped making
    // sense halfway, and the difference is what the model needs.
    if (!evidence && ran.readable) evidence = { callId: reanchored ? `${callId}.again` : callId, toolId, value: ran.result.evidence };
  }
  return { verdict: verdictOf(input, "ok", outcomes), ...(evidence ? { evidence } : {}) };
}

function verdictOf(
  input: AutomationStudioFlowDraftReplayInput,
  reset: "ok" | "failed",
  outcomes: readonly AutomationStudioFlowDraftReplayOutcome[]
): AutomationStudioFlowDraftDryRun {
  // A step the Flow would not always run answers for itself: the replay is one
  // situation, and a step that exists for another one is not a broken step
  // (`../../flow-draft/routing.ts`). Nor is a step that ran without what a
  // verified step's withheld effect would have made (`../../flow-draft/verify-only.ts`).
  return automationStudioFlowDraftDryRunVerdict({
    attempt: input.attempt,
    reset,
    outcomes,
    conditional: new Set([...automationStudioFlowDraftConditionalStepIds(input.steps), ...automationStudioFlowDraftWithheldStepIds(outcomes)])
  });
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
function leftUndone(outcome: AutomationStudioFlowDraftReplayOutcome, conditional: ReadonlySet<string>): boolean {
  if (outcome.withheldBy !== undefined) return true;
  if (outcome.status !== "replayed") return outcome.stepId !== undefined && conditional.has(outcome.stepId);
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
  input: AutomationStudioFlowDraftReplayInput,
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
type ReplayAnswer =
  | { readable: true; result: NonNullable<ReturnType<typeof automationStudioLlmEvidenceParseToolExecutionResult>> }
  | { readable: false };

/**
 * One replay call.
 *
 * A throw is not swallowed: the permission gate raising a request throws here,
 * and the run has to stop rather than record a step as having failed to replay.
 * So a cancelled run re-throws, and everything else is an unreadable answer.
 */
async function call(
  input: AutomationStudioFlowDraftReplayInput,
  callId: string,
  toolId: string,
  value: JsonObject
): Promise<ReplayAnswer> {
  try {
    const ran = await input.executeTool({ callId, toolId, value, ...(input.signal ? { signal: input.signal } : {}) });
    const result = automationStudioLlmEvidenceParseToolExecutionResult(ran, "mutate");
    return result ? { readable: true, result } : { readable: false };
  } catch (error) {
    if (input.signal?.aborted) throw error;
    return { readable: false };
  }
}
