import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import { automationStudioActivityInBuild, automationStudioActivityRecoveryChoice, emitAutomationStudioActivityStepRecovering, emitAutomationStudioActivityThought } from "../../activity/index.ts";
import type { AutomationStudioGraphExecutionTrace, AutomationStudioNodeAttemptTrace } from "../contracts.ts";
import {
  automationStudioAssessAttemptFault,
  automationStudioContinuationAfterFailure,
  automationStudioPlannedRetryWait,
  automationStudioRunEffectCheck,
  automationStudioRunMayStillAbsorb,
  automationStudioStopMessage,
  type AutomationStudioEffectCheckResult,
  type AutomationStudioFaultAssessment
} from "../defensive/index.ts";
import { chooseAutomationStudioEdge, missingTargetTrace } from "../graph-navigation.ts";
import { runAutomationStudioRecoveryLadder } from "../ladder-run.ts";
import { executeAutomationStudioNode } from "../node-execution.ts";
import { automationStudioRunWait } from "../pacing/index.ts";
import { recoveryBudgetState } from "../recovery-budget.ts";
import { automationStudioRecoveryPathEdge, failureMessageForRecoveryStop } from "../recovery-ladder.ts";
import { recordRegionTransition } from "../region-execution.ts";
import { automationStudioAttemptIsRetryable, type AutomationStudioNodeRetryPolicy } from "../retry-policy.ts";
import { automationStudioHostEffectCheck } from "../transition-comparison.ts";
import { automationStudioRecordDefendedFault } from "./defended-fault.ts";
import { automationStudioEndedTrace } from "./ended-trace.ts";
import { automationStudioStepRepairIncident } from "./incident-repair.ts";
import { automationStudioStepStampFailureClass } from "./lifecycle-stamps.ts";
import type { AutomationStudioStepLoopContext } from "./loop-context.ts";
import type { AutomationStudioStepOutcome } from "./loop-outcome.ts";
import { automationStudioStepOnFail } from "./on-fail.ts";
import { automationStudioStepOnRetry } from "./on-retry.ts";

/**
 * Decides what a failed attempt comes to: its fault is assessed and the ladder
 * consulted, then the run retries the node after its planned wait (`retry`),
 * carries on down the success route because the state already holds
 * (`proceed`), takes the Flow's failed route or continues past a failure that
 * is not fatal (`next`), or stops (`return`). Every way out puts the fault on
 * the run's defence ledger.
 *
 * An uncertain lasting act (C6 step 4) goes through the effect check first,
 * before the ladder, any retry, handler, state route or alternative: `landed`
 * carries the run on as done, `not_landed` makes the act unacted so the normal
 * retry path applies, and `unknown` stops the run as Outcome uncertain with no
 * rung below it run. An attempt whose act was never uncertain never meets it.
 *
 * Lifecycle handlers (C3, C6 steps 5-6): a permitted retry dispatches On Retry
 * before its wait, and a failure the ladder could not resolve dispatches On
 * Fail before the failed route or the continuation. Neither changes anything
 * in a run with no Handler in scope. The attempt is classified once the run
 * has decided what it came to, and only a stop marks its incident a true
 * failure. A true failure holds the run in place and asks once for a fix to
 * its unit (`./incident-repair.ts`, C6 step 8); a fix that holds carries the
 * run on from the same node, and the run ends as before when there is none.
 */
export async function automationStudioStepFailedAttempt(
  ctx: AutomationStudioStepLoopContext,
  step: {
    node: AutomationStudioFlowNode;
    attempt: AutomationStudioNodeAttemptTrace;
    attemptIndex: number;
    regionId: string | undefined;
    retryPolicy: AutomationStudioNodeRetryPolicy;
  }
): Promise<AutomationStudioStepOutcome> {
  const { flow, options, runState, now, attempts, values, effects, withholding } = ctx;
  const { node: failedNode, attempt, attemptIndex, regionId, retryPolicy } = step;
  // An authored stop ends the run with its own reason (C6, "What counts as a
  // true failure"): it is the planned ending of whatever led to it, never a
  // failure of its own, so no incident opens, no rung runs and no model is asked.
  if (isDeliberateStop(failedNode)) return { kind: "return", trace: recoveryStopTrace(ctx, failedNode.id, authoredStopReason(failedNode, attempt)) };
  const failedEdge = chooseAutomationStudioEdge(flow, failedNode.id, attempt.route ?? "failed");
  // Classified before the ladder is consulted, because the ladder asks
  // whether this failure may be attempted again and the answer is this
  // assessment. Every fault lands on the run's defence ledger below,
  // whichever way the ladder goes.
  let fault = automationStudioAssessAttemptFault(attempts[attemptIndex]!, failedNode, now());
  // A failure that asked for a wait raises this node's pace for the rest of the run (`pacing/`), and its attempt says so.
  const raisedToMs = fault?.hintedWaitMs === undefined ? undefined : runState.pace.learn(failedNode, fault.hintedWaitMs);
  if (raisedToMs !== undefined) attempts[attemptIndex] = { ...attempts[attemptIndex]!, pace: { ...(attempts[attemptIndex]!.pace ?? { inForceMs: 0, waitedMs: 0 }), raisedToMs } };
  const mayAbsorb = automationStudioRunMayStillAbsorb(runState.defence.runWaitedMs());
  // Settles the step as failed, with its failure's code, so a card can say
  // why ("the page was busy", D8); it opens no "Recovery started" row of
  // its own (D5): the recovery thought below says what recovery chose.
  emitAutomationStudioActivityStepRecovering({ nodeId: failedNode.id, label: failedNode.label, definitionId: failedNode.definitionId, parameters: failedNode.parameterValues, failureCode: attempts[attemptIndex]!.failure?.code });
  await options.commandRun?.checkpoint();
  // C6 step 4: the effect check, before anything below can make the act again or take the run elsewhere.
  if (fault?.actUncertain) {
    const result = await automationStudioRunEffectCheck(automationStudioHostEffectCheck(failedNode, options), attempts[attemptIndex]!, ctx.arrival.attempts);
    attempts[attemptIndex] = { ...attempts[attemptIndex]!, effectCheck: { result, checkedAt: now() } };
    await options.commandRun?.checkpoint();
    if (options.signal?.aborted) return { kind: "return", trace: automationStudioEndedTrace(ctx, "cancelled", failedNode.id, "Run cancelled.") };
    if (result !== "not_landed") return settledUncertainAct(ctx, failedNode, attemptIndex, fault, result);
    // Did not land: unacted, so the ladder, the retry floor and every rung below apply as to any unacted fault.
    fault = automationStudioAssessAttemptFault(attempts[attemptIndex]!, failedNode, now());
  }
  const ladder = await runAutomationStudioRecoveryLadder({
    flow,
    node: failedNode,
    attempt: attempts[attemptIndex]!,
    failedEdge,
    options,
    budgetState: recoveryBudgetState(attempts, attemptIndex, failedNode.id, options.currentSubflowId, flow),
    policy: retryPolicy,
    attemptsForNode: ctx.arrival.attempts,
    consumed: ctx.arrival.consumed,
    mayAbsorb,
    executeNode: async (interference) => {
      const cleared = await executeAutomationStudioNode(flow, interference, values, options, ctx.nextAttemptNumber(), withholding, runState);
      await options.commandRun?.checkpoint();
      attempts.push(regionId ? { ...cleared, regionId } : cleared);
      for (const [key, value] of Object.entries(cleared.outputs)) {
        values[`${interference.id}.${key}`] = value;
        values[key] = value;
      }
      for (const effect of cleared.effects) effects.push({ ...effect, nodeId: interference.id });
      return cleared;
    }
  });
  const recoveryDecision = ladder.decision;
  // A retry's wait, bounded and with a hint's elapsed time credited, settled before the recovery is worded (`defensive/planned-retry-wait.ts`).
  const settled = attempts[attemptIndex]!;
  const { wait, hint, siteAsked } = automationStudioPlannedRetryWait({
    retryBackoffMs: ladder.kind === "retry" ? ladder.backoffMs : undefined, hintedWaitMs: fault?.hintedWaitMs, settledAt: settled.finishedAt ?? settled.startedAt, now: now(),
    nodeWaitedMs: runState.defence.nodeWaitedMs(failedNode.id), runWaitedMs: runState.defence.runWaitedMs(), node: failedNode
  });
  const choice = automationStudioActivityRecoveryChoice(ladder, { attempts: ctx.arrival.attempts, actUncertain: fault?.actUncertain === true, mayAbsorb, retryable: automationStudioAttemptIsRetryable(attempts[attemptIndex]!, failedNode), test: automationStudioActivityInBuild(), ...siteAsked });
  emitAutomationStudioActivityThought({ phase: "repairing", title: choice.title, text: choice.text, ref: failedNode.id });
  attempts[attemptIndex] = {
    ...attempts[attemptIndex]!,
    recoveryDecision
  };
  if (ladder.kind === "retry" && wait) {
    const { outcome: onRetry, incidentId } = await automationStudioStepOnRetry(ctx, failedNode, attempts[attemptIndex]!, attemptIndex);
    if (onRetry.kind === "return") {
      automationStudioRecordDefendedFault(runState, failedNode.id, attempts[attemptIndex]!, ctx.arrival.attempts, fault, "stopped", 0);
      return onRetry;
    }
    if (onRetry.kind === "route") {
      automationStudioStepStampFailureClass(ctx, attemptIndex, { uncertainAct: false, onFail: [{ kind: "handler", handlerId: onRetry.lifecycle?.handlerId ?? "", when: "true", outcome: "route" }] }, incidentId);
      automationStudioRecordDefendedFault(runState, failedNode.id, attempts[attemptIndex]!, ctx.arrival.attempts, fault, "continued", 0);
      return { kind: "next", node: onRetry.node };
    }
    automationStudioStepStampFailureClass(ctx, attemptIndex, { uncertainAct: false, movedBy: onRetry.kind === "resume" ? "on_retry" : "retry", onFail: [] }, incidentId);
    automationStudioRecordDefendedFault(runState, failedNode.id, attempts[attemptIndex]!, ctx.arrival.attempts, fault, "retried", wait.waitMs);
    ctx.pendingRetry = { attemptNumber: ctx.arrival.attempts + 1, maxAttempts: retryPolicy.maxAttempts, backoffMs: wait.waitMs, rung: ladder.rung, previousAttemptId: attempt.attemptId, ...(hint ? { hintedWaitMs: hint.askedMs, creditedMs: hint.creditedMs } : {}) };
    await options.commandRun?.checkpoint();
    await automationStudioRunWait(options, wait.waitMs);
    await options.commandRun?.checkpoint();
    if (options.signal?.aborted) return { kind: "return", trace: automationStudioEndedTrace(ctx, "cancelled", failedNode.id, "Run cancelled.") };
    return { kind: "retry" };
  }
  if (ladder.kind === "satisfied") {
    // The state the node was recorded to produce already holds, so the run
    // carries on down the success route rather than repeating an action
    // that has already happened. The attempt keeps its own failed status:
    // what happened and what the ladder made of it are two facts, not one.
    // `stateHeld` is the second fact, so every reader of what the node
    // came to reads it as done (`flow-change/attempt-projection.ts`).
    attempts[attemptIndex] = { ...attempts[attemptIndex]!, stateHeld: { rung: ladder.rung, route: "success" } };
    automationStudioStepStampFailureClass(ctx, attemptIndex, { uncertainAct: false, movedBy: "satisfied", onFail: [] });
    automationStudioRecordDefendedFault(runState, failedNode.id, attempts[attemptIndex]!, ctx.arrival.attempts, fault, "continued", 0);
    return { kind: "proceed", routeOverride: "success" };
  }
  // On Fail, before the failed route or the continuation is taken (`./on-fail.ts`).
  const onFail = await automationStudioStepOnFail(ctx, { node: failedNode, attemptIndex, fault });
  if (onFail.kind !== "pass") {
    automationStudioRecordDefendedFault(runState, failedNode.id, attempts[attemptIndex]!, ctx.arrival.attempts, fault, onFail.kind === "return" ? "stopped" : "continued", 0);
    return onFail;
  }
  const { incidentId } = onFail;
  const executableFailedEdge = automationStudioRecoveryPathEdge(flow, failedNode, recoveryDecision, failedEdge);
  if (!executableFailedEdge) {
    // The ladder is spent and the Flow has no failed route of its own.
    // Before this, that ended the run -- every time, for every node,
    // whatever the node was for. A Flow does not stop for a node whose
    // failure is not fatal to what the Flow is for, and the continuation
    // rule says which those are and why.
    const continuation = automationStudioContinuationAfterFailure(flow, failedNode, fault);
    if (continuation.continues) {
      runState.defence.continuePast(failedNode.id);
      automationStudioRecordDefendedFault(runState, failedNode.id, attempts[attemptIndex]!, ctx.arrival.attempts, fault ?? continuationFault(continuation.reason), "continued", 0);
      const onwardEdge = chooseAutomationStudioEdge(flow, failedNode.id, "success", failedNode.definitionId);
      const stopsOnward = onwardEdge ? ctx.stopAfter?.stops({ fromNodeId: failedNode.id, toNodeId: onwardEdge.targetNodeId }) : undefined;
      if (stopsOnward) return { kind: "return", trace: ctx.stoppedAt(failedNode.id, stopsOnward) };
      if (onwardEdge) {
        const onward = ctx.nodesById.get(onwardEdge.targetNodeId);
        if (!onward) return { kind: "return", trace: missingTargetTrace(ctx.startedAt, now(), onwardEdge, attempts, values, effects) };
        recordRegionTransition(onwardEdge, regionId, options, ctx.regionTransitions, now());
        // The run goes on past a failure that is not fatal to the Flow, as past an optional step.
        automationStudioStepStampFailureClass(ctx, attemptIndex, { uncertainAct: false, movedBy: "optional_way_on", onFail: [] }, incidentId);
        return { kind: "next", node: onward };
      }
    }
    // Nothing took the run on: a true failure (or an uncertain act), which marks the incident.
    const verdict = automationStudioStepStampFailureClass(ctx, attemptIndex, { uncertainAct: fault?.actUncertain === true, onFail: [] }, incidentId);
    const attemptsHere = ctx.arrival.attempts;
    const repaired = verdict === "true_failure" ? await automationStudioStepRepairIncident(ctx, { node: failedNode, attemptIndex, incidentId, fault }) : undefined;
    const settledFault = fault ?? continuationFault(continuation.reason);
    if (repaired?.kind === "next") {
      // Held in place: the node is attempted again with its fix, and that attempt is the fix's trial.
      automationStudioRecordDefendedFault(runState, failedNode.id, attempts[attemptIndex]!, attemptsHere, settledFault, "retried", 0);
      return repaired;
    }
    automationStudioRecordDefendedFault(runState, failedNode.id, attempts[attemptIndex]!, attemptsHere, settledFault, "stopped", 0);
    if (repaired) return repaired;
    return { kind: "return", trace: recoveryStopTrace(ctx, failedNode.id, automationStudioStopMessage(fault, failureMessageForRecoveryStop(recoveryDecision, attempt))) };
  }
  const failedRouteNode = ctx.nodesById.get(executableFailedEdge.targetNodeId);
  const deliberateStop = isDeliberateStop(failedRouteNode);
  automationStudioStepStampFailureClass(ctx, attemptIndex, {
    uncertainAct: fault?.actUncertain === true,
    onFail: [{ kind: "edge", edgeId: executableFailedEdge.id, targetNodeId: executableFailedEdge.targetNodeId, deliberateStop }]
  }, incidentId);
  automationStudioRecordDefendedFault(runState, failedNode.id, attempts[attemptIndex]!, ctx.arrival.attempts, fault, "continued", 0);
  const stopsFailedRoute = ctx.stopAfter?.stops({ fromNodeId: failedNode.id, toNodeId: executableFailedEdge.targetNodeId });
  if (stopsFailedRoute) return { kind: "return", trace: ctx.stoppedAt(failedNode.id, stopsFailedRoute) };
  if (!failedRouteNode) return { kind: "return", trace: missingTargetTrace(ctx.startedAt, now(), executableFailedEdge, attempts, values, effects) };
  recordRegionTransition(executableFailedEdge, regionId, options, ctx.regionTransitions, now());
  return { kind: "next", node: failedRouteNode };
}

/**
 * What an uncertain lasting act comes to once its effect check answered
 * `landed` or `unknown` (C6 step 4).
 *
 * `landed`: the act happened. The attempt is marked done as the ladder's
 * satisfied rung marks it (`stateHeld`; it keeps its failed status), and the
 * run carries on down the success route without making the act again.
 *
 * `unknown`: the run stops as Outcome uncertain. No rung below runs -- no
 * retry, no On Retry or On Fail handler, no failed route, no continuation past
 * it, no repair -- because each of them could act a second time or walk past an
 * act that may have landed.
 */
function settledUncertainAct(
  ctx: AutomationStudioStepLoopContext,
  node: AutomationStudioFlowNode,
  attemptIndex: number,
  fault: AutomationStudioFaultAssessment,
  result: Exclude<AutomationStudioEffectCheckResult, "not_landed">
): AutomationStudioStepOutcome {
  const { attempts, runState } = ctx;
  if (result === "landed") {
    attempts[attemptIndex] = { ...attempts[attemptIndex]!, stateHeld: { rung: "skip_satisfied_node", route: "success" } };
    emitAutomationStudioActivityThought({ phase: "repairing", title: "The step had taken effect", text: "Its answer was lost, but the page shows what the step was to do, so the run goes on without doing it again.", ref: node.id });
    automationStudioStepStampFailureClass(ctx, attemptIndex, { uncertainAct: false, movedBy: "effect_landed", onFail: [] });
    automationStudioRecordDefendedFault(runState, node.id, attempts[attemptIndex]!, ctx.arrival.attempts, { ...fault, reason: `${fault.reason} The effect check then showed it had taken effect, so the run went on.` }, "continued", 0);
    return { kind: "proceed", routeOverride: "success" };
  }
  const settled = { ...fault, reason: `${fault.reason} The effect check could not show whether it did.` };
  emitAutomationStudioActivityThought({ phase: "repairing", title: "Outcome uncertain", text: "The step may already have taken effect and nothing on the page shows whether it did, so it is not done again and the run stops here.", ref: node.id });
  automationStudioStepStampFailureClass(ctx, attemptIndex, { uncertainAct: true, onFail: [] });
  automationStudioRecordDefendedFault(runState, node.id, attempts[attemptIndex]!, ctx.arrival.attempts, settled, "stopped", 0);
  return { kind: "return", trace: recoveryStopTrace(ctx, node.id, automationStudioStopMessage(settled, attempts[attemptIndex]!.message)) };
}

/** An authored stop: an End whose result is `failed`, which ends the run on purpose. */
function isDeliberateStop(node: AutomationStudioFlowNode | undefined): boolean {
  return node?.definitionId === "builtin.control.end" && node.parameterValues?.resultStatus === "failed";
}

/** The reason an authored stop ends the run with: its own message, else what its attempt said. */
function authoredStopReason(node: AutomationStudioFlowNode, attempt: AutomationStudioNodeAttemptTrace): string | undefined {
  const message = node.parameterValues?.message;
  return typeof message === "string" && message.trim() ? message.trim() : attempt.message;
}

/** A run stopped on a failure the ladder could not resolve and no route or continuation took past. */
function recoveryStopTrace(ctx: AutomationStudioStepLoopContext, nodeId: string, recoveryStopMessage: string | undefined): AutomationStudioGraphExecutionTrace {
  return {
    status: "failed",
    startedAt: ctx.startedAt,
    finishedAt: ctx.now(),
    currentNodeId: nodeId,
    attempts: ctx.attempts,
    values: ctx.values,
    effects: ctx.effects, regionTransitions: ctx.regionTransitions,
    ...(recoveryStopMessage ? { message: recoveryStopMessage } : {})
  };
}

/**
 * The ledger entry for a failure the policy could not classify at all -- a node
 * that failed with no record, no throw and nothing readable in its message.
 *
 * It still has to be recorded. Whether the Flow went on past it or stopped there
 * is a decision somebody will have to understand, and "no fault was recorded"
 * would leave that decision with no reason attached to it.
 */
function continuationFault(reason: string): AutomationStudioFaultAssessment {
  return {
    disposition: "refuse",
    category: "ambiguous_or_unknown",
    code: "executor.fault.unclassified",
    source: "result_message",
    effect: "ambiguous",
    reason
  };
}
