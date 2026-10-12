import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import { automationStudioActivityAskResolution, emitAutomationStudioActivityAskResolved, emitAutomationStudioActivityWaitingOnAsk } from "../../activity/index.ts";
import { automationStudioAskInEffects, automationStudioAskSettlement, automationStudioParkedRun, type AutomationStudioAsk, type AutomationStudioAskSettlement, type AutomationStudioParkedRun } from "../../parking/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioNodeAttemptTrace } from "../contracts.ts";
import { automationStudioAssessAttemptFault } from "../defensive/index.ts";
import { automationStudioTimedPause } from "../pacing/index.ts";
import { automationStudioIsPersonNeededAsk, automationStudioPersonNeededStep } from "../person-needed.ts";
import { automationStudioRecordDefendedFault } from "./defended-fault.ts";
import { automationStudioEndedTrace } from "./ended-trace.ts";
import type { AutomationStudioStepLoopContext } from "./loop-context.ts";
import type { AutomationStudioStepOutcome } from "./loop-outcome.ts";

/**
 * Handles the question an attempt raised, and the wait it asked for: the ask is
 * opened, then settled in place or the run parks on it, and a timed pause is
 * taken. What comes back is either the run's end -- a park, a refusal, a
 * question nobody could be told -- or the way out of the node an answer chose.
 */
export async function automationStudioStepAskOrPark(
  ctx: AutomationStudioStepLoopContext,
  step: {
    node: AutomationStudioFlowNode;
    attempt: AutomationStudioNodeAttemptTrace;
    attemptIndex: number;
    stepIndex: number;
    remainingMs: number | undefined;
  }
): Promise<Extract<AutomationStudioStepOutcome, { kind: "return" | "proceed" }>> {
  const { options, runState, now, attempts, values } = ctx;
  const { node, attempt, attemptIndex, remainingMs } = step;
  // The question the attempt raised, from wherever inside it -- the node, a
  // domain answering a dispatch, a gate. It is read here rather than at the
  // node, which is what makes asking a property of a run and not of one node
  // definition.
  const raised = automationStudioAskInEffects(attempt.effects, {
    askId: attempt.attemptId,
    stage: "execution",
    nodeId: node.id,
    definitionId: node.definitionId,
    attemptId: attempt.attemptId
  });
  // A step only a person can get past asks one (`person-needed.ts`), and
  // neither the ladder nor a repair runs on it.
  const personStep = automationStudioPersonNeededStep({ attempt, node, attempts, raised, parkingBound: Boolean(options.parking) });
  if (personStep.kind === "exhausted") {
    automationStudioRecordDefendedFault(runState, node.id, attempt, ctx.arrival.attempts, automationStudioAssessAttemptFault(attempt, node, now()), "stopped", 0);
    return { kind: "return", trace: automationStudioEndedTrace(ctx, "failed", node.id, personStep.message) };
  }
  const ask = raised ?? (personStep.kind === "ask" ? personStep.ask : undefined);
  const personNeeded = automationStudioIsPersonNeededAsk(ask);
  let routeOverride: string | undefined;
  if (ask) {
    const parked = automationStudioParkedRun({
      ask,
      nodeId: node.id,
      definitionId: node.definitionId,
      attemptId: attempt.attemptId,
      parkedAtMs: now(),
      carried: {
        variables: Object.fromEntries(runState.variables),
        loops: Object.fromEntries(runState.loops),
        stepsTaken: step.stepIndex + 1,
        maxSteps: ctx.maxSteps,
        ...(options.callFlowAttemptPath?.length ? { callFlowAttemptPath: [...options.callFlowAttemptPath] } : {})
      }
    });
    attempts[attemptIndex] = { ...attempts[attemptIndex]!, ask: { askId: ask.askId, kind: ask.kind, parks: ask.parks, status: "pending", ...(personNeeded ? { personNeeded: true as const } : {}) } };
    await options.commandRun?.checkpoint();
    const undelivered = await openAutomationStudioAsk(options, ask);
    if (undelivered) {
      return { kind: "return", trace: automationStudioEndedTrace(ctx, "failed", node.id, undelivered) };
    }
    if (ask.parks) {
      emitAutomationStudioActivityWaitingOnAsk(ask);
      let settlement: Awaited<ReturnType<typeof settleAskInPlace>>;
      try {
        settlement = await settleAskInPlace(options, parked);
        await options.commandRun?.checkpoint();
      } catch (error) {
        // The thread could not be read: the wait is over, and nobody answered.
        emitAutomationStudioActivityAskResolved(ask, "cancelled", "running");
        throw error;
      }
      if (!settlement) {
        return { kind: "return", trace: { status: "waiting", startedAt: ctx.startedAt, currentNodeId: node.id, attempts, values, effects: ctx.effects, regionTransitions: ctx.regionTransitions, parked, ...(attempt.message ? { message: attempt.message } : {}) } };
      }
      if (settlement.outcome === "refused") {
        emitAutomationStudioActivityAskResolved(ask, "cancelled", "running");
        return { kind: "return", trace: automationStudioEndedTrace(ctx, "failed", node.id, settlement.message) };
      }
      // Said where the wait settles; a run cancelled while it waited was answered by nobody and timed out on nothing.
      emitAutomationStudioActivityAskResolved(ask, settlement.outcome === "answered" ? automationStudioActivityAskResolution(ask, settlement.answer) : options.signal?.aborted ? "cancelled" : "timed_out", "running");
      attempts[attemptIndex] = { ...attempts[attemptIndex]!, ask: settledAskRecord(ask, settlement) };
      // What the person said is data the rest of the Flow can read, put
      // where every other node output goes so a binding reaches it the
      // ordinary way. Not "Continue" on a person-needed ask: that is no data,
      // and written under the bare `answer` key it would overwrite an output.
      if (settlement.outcome === "answered" && settlement.answer.value !== null && !personNeeded) {
        values[`${node.id}.answer`] = settlement.answer.value;
        values.answer = settlement.answer.value;
      }
      routeOverride = settlement.route;
    }
  }
  // A timed pause -- a Wait node's -- is taken and the run goes on (`pacing/timed-pause.ts`); any other wait parks the run.
  const paused = routeOverride === undefined && attempt.status === "waiting" ? await automationStudioTimedPause({ attempt: attempts[attemptIndex]!, options, now, regionRemainingMs: remainingMs }) : undefined;
  if (paused) attempts[attemptIndex] = paused;
  if (paused && options.signal?.aborted) return { kind: "return", trace: automationStudioEndedTrace(ctx, "cancelled", node.id, "Run cancelled.") };
  if (routeOverride === undefined && attempt.status === "waiting" && !paused) {
    return {
      kind: "return",
      trace: {
        status: "waiting",
        startedAt: ctx.startedAt,
        currentNodeId: node.id,
        attempts,
        values,
        effects: ctx.effects, regionTransitions: ctx.regionTransitions,
        ...(attempt.message ? { message: attempt.message } : {})
      }
    };
  }
  return { kind: "proceed", ...(routeOverride === undefined ? {} : { routeOverride }) };
}

/**
 * Puts the ask where a person will see it. Returns the failure message when
 * nobody could be told, and nothing when the ask was opened or no port is bound.
 *
 * A port that throws fails the run rather than parking it. The product's rule
 * is that a blocked action reaches the person, and a run left waiting on a
 * question that was never delivered is exactly the silent refusal that rule
 * exists to stop. With no port bound at all the run still parks and is still
 * resumable by whoever holds its trace: a host that has not wired a
 * conversation up yet should not have its runs fail for asking.
 */
async function openAutomationStudioAsk(options: AutomationStudioGraphExecutionOptions, ask: AutomationStudioAsk): Promise<string | undefined> {
  if (!options.parking) return undefined;
  try {
    await options.parking.open(ask);
    return undefined;
  } catch {
    return `Run stopped: it needed to ask a person something (${ask.askId}), and the question could not be delivered.`;
  }
}

/**
 * Waits for the answer without returning from the run, for a port that can hold
 * one open. Nothing back means this run parks instead and is resumed from its
 * trace later, which is the shape that survives a restart.
 */
async function settleAskInPlace(options: AutomationStudioGraphExecutionOptions, parked: AutomationStudioParkedRun): Promise<AutomationStudioAskSettlement | undefined> {
  const port = options.parking;
  if (!port?.awaitAnswer) return undefined;
  const answer = await port.awaitAnswer(parked.ask, {
    ...(parked.expiresAtMs !== undefined ? { expiresAtMs: parked.expiresAtMs } : {}),
    ...(options.signal ? { signal: options.signal } : {})
  });
  // A port that waited as long as it was told and came back with nothing has
  // established the expiry by having waited, so no clock is consulted here.
  return automationStudioAskSettlement(parked, answer, options.now?.() ?? Date.now());
}

/** What the attempt records once its ask is settled: how it ended, and the way the run left the node. */
function settledAskRecord(ask: AutomationStudioAsk, settlement: Extract<AutomationStudioAskSettlement, { outcome: "answered" | "expired" }>): NonNullable<AutomationStudioNodeAttemptTrace["ask"]> {
  return {
    askId: ask.askId,
    kind: ask.kind,
    parks: ask.parks,
    status: settlement.outcome === "answered" ? "answered" : "expired",
    route: settlement.route,
    settledAtMs: settlement.settledAtMs,
    ...(automationStudioIsPersonNeededAsk(ask) ? { personNeeded: true as const } : {})
  };
}
