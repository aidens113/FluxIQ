import type { AutomationStudioFlowDocument } from "../../model/index.ts";
import type { AutomationStudioAskAnswer, AutomationStudioParkedRun, AutomationStudioParkRefusalReason } from "../parking/index.ts";
import { automationStudioAskSettlement } from "../parking/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioGraphExecutionTrace, AutomationStudioNodeAttemptTrace } from "./contracts.ts";
import { resumeAutomationStudioGraphRun, type AutomationStudioGraphRunSeed } from "./graph-run.ts";

/** How a parked run is being settled: somebody answered, or nobody did. */
export type AutomationStudioRunResumption =
  | { kind: "answer"; answer: AutomationStudioAskAnswer }
  | { kind: "timeout" };

/**
 * A resume either produces the continued run or moves nothing at all. A refusal
 * leaves the run parked exactly as it was, so a mistaken answer costs nothing
 * and the right one still works.
 */
export type AutomationStudioResumeOutcome =
  | { outcome: "resumed"; trace: AutomationStudioGraphExecutionTrace }
  | { outcome: "refused"; reason: AutomationStudioParkRefusalReason; message: string };

/**
 * Continues a run that stopped on a question, from the answer.
 *
 * It is a resume and not a restart, and the difference is the whole point: the
 * attempts the run had made, the values it had computed, the variables its
 * nodes had written, the place each loop had reached and the step budget it had
 * spent all come forward, and the node it parked at is never executed again. A
 * run that pressed "send" and then asked whether to press "confirm" does not
 * press "send" twice.
 *
 * What comes forward is what the trace holds, which is the saved trace: values
 * the run resolved out of state are withheld there, and rows it captured are
 * dataset markers. Passing `options.inputs` again puts the run's own inputs
 * back over the withheld copies. The rest is named in this module's report; a
 * host that can hold a run open should bind a parking port with `awaitAnswer`
 * instead, which never serialises anything and loses nothing.
 */
export async function resumeAutomationStudioGraph(
  request: {
    flow: AutomationStudioFlowDocument;
    /** The `waiting` trace the parked run returned. Its `parked` record says what is being answered. */
    trace: AutomationStudioGraphExecutionTrace;
    resumption: AutomationStudioRunResumption;
    /** The options the parked run was started with, so the resumed run executes the same way. */
    options?: AutomationStudioGraphExecutionOptions;
  },
  onExecutedTrace?: (executed: AutomationStudioGraphExecutionTrace, saved: AutomationStudioGraphExecutionTrace) => void
): Promise<AutomationStudioResumeOutcome> {
  const options = request.options ?? {};
  const nowMs = options.now?.() ?? Date.now();
  const parked = request.trace.parked;
  if (!parked || request.trace.status !== "waiting") {
    return refused("not_parked", "This trace is not a run parked on a question, so there is nothing to answer.");
  }
  if (!request.flow.nodes.some((node) => node.id === parked.nodeId)) {
    return refused("not_parked", `The Flow no longer has the node ${parked.nodeId} this run parked at.`);
  }
  const overdue = overdueRefusal(parked, request.resumption, nowMs);
  if (overdue) return overdue;
  const settlement = automationStudioAskSettlement(parked, request.resumption.kind === "answer" ? request.resumption.answer : undefined, nowMs);
  if (settlement.outcome === "refused") return refused(settlement.reason, settlement.message);
  const trace = await resumeAutomationStudioGraphRun(
    request.flow,
    { ...options, startNodeId: parked.nodeId, ...(parked.carried.callFlowAttemptPath ? { callFlowAttemptPath: parked.carried.callFlowAttemptPath } : {}) },
    {
      startedAt: request.trace.startedAt,
      stepsTaken: parked.carried.stepsTaken,
      maxSteps: parked.carried.maxSteps,
      attempts: settledAttempts(request.trace.attempts, parked, settlement.outcome, settlement.route, settlement.settledAtMs),
      values: request.trace.values,
      effects: request.trace.effects,
      regionTransitions: request.trace.regionTransitions ?? [],
      variables: parked.carried.variables,
      loops: parked.carried.loops,
      route: settlement.route
    },
    onExecutedTrace
  );
  return { outcome: "resumed", trace };
}

/**
 * Nobody answering is an answer, but only once the ask has actually run out of
 * time. An ask that waits indefinitely never runs out, and one that has not yet
 * reached its deadline is still open, so neither can be closed by declaring a
 * timeout early -- otherwise "if nobody responds" becomes a way to take the
 * default route whenever the default is the convenient one.
 *
 * A *late* answer is not refused here. While a run is still parked, the answer
 * is the only thing that will ever move it, and refusing it strands the run for
 * good. Whoever sweeps expired asks closes them by marking the ask `expired`,
 * after which this run is already settled and is refused as such.
 */
function overdueRefusal(parked: AutomationStudioParkedRun, resumption: AutomationStudioRunResumption, nowMs: number): AutomationStudioResumeOutcome | undefined {
  if (resumption.kind !== "timeout") return undefined;
  if (parked.expiresAtMs === undefined) {
    return refused("not_expired", `Ask ${parked.ask.askId} waits indefinitely, so it cannot time out.`);
  }
  if (nowMs < parked.expiresAtMs) {
    return refused("not_expired", `Ask ${parked.ask.askId} has ${parked.expiresAtMs - nowMs}ms left to be answered.`);
  }
  return undefined;
}

/** The run's attempts with the parked one's ask closed, so the resumed trace says how the question was settled. */
function settledAttempts(
  attempts: AutomationStudioNodeAttemptTrace[],
  parked: AutomationStudioParkedRun,
  outcome: "answered" | "expired",
  route: string,
  settledAtMs: number
): AutomationStudioNodeAttemptTrace[] {
  return attempts.map((attempt) => attempt.ask?.askId === parked.ask.askId
    ? { ...attempt, ask: { ...attempt.ask, status: outcome, route, settledAtMs } }
    : attempt);
}

function refused(reason: AutomationStudioParkRefusalReason, message: string): AutomationStudioResumeOutcome {
  return { outcome: "refused", reason, message };
}
