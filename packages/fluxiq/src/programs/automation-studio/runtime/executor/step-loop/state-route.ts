import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import { automationStudioNodeRouteSignatures } from "../../route-state/passive/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../contracts.ts";
import { automationStudioTargetFailureProvesUnacted } from "../target-evidence/index.ts";
import { missingTargetTrace } from "../graph-navigation.ts";
import { recordRegionTransition } from "../region-execution.ts";
import type { AutomationStudioNodeRetryPolicy } from "../retry-policy.ts";
import { announceAutomationStudioStateRoute, automationStudioStateRoutedAttempt, decideAutomationStudioStateRoute, type AutomationStudioStateRouteDecision } from "../state-routing/index.ts";
import { automationStudioStepRetryBeforeRouting } from "./could-not-run-retry.ts";
import { automationStudioEndedTrace } from "./ended-trace.ts";
import { automationStudioStepStampFailureClass } from "./lifecycle-stamps.ts";
import type { AutomationStudioStepLoopContext } from "./loop-context.ts";
import type { AutomationStudioStepOutcome } from "./loop-outcome.ts";

/**
 * A step that cannot run continues where the page is, before any fault,
 * ladder rung, budget or recovery (`state-routing/`). The Flow's declared way
 * past a sometimes-present step is its first case; with no way on, the attempt
 * keeps its routing record and the loop goes on to the ladder (`proceed`).
 *
 * `routing` is the decision the readiness gate already took, when it took one.
 *
 * Before routing, a step with attempts left dispatches On Retry (C6 step 5),
 * unless the Flow declares its way past the step: a handler that cleared the
 * way retries the step at once (`retry`), and one that routed to a checkpoint
 * moves the run there (`next`). Only when none took the run on does state
 * routing decide.
 *
 * A step that recorded its own effect reads the page first (t486): when the
 * page already shows what the step does (`effect_holds`, a store the site
 * already remembers), the step is satisfied by state, and retrying it, or
 * running a handler that clears the way to retry it, could only do it a
 * second time. So state routing decides before On Retry, and a way on it
 * finds is taken with no handler run and nothing dispatched again. With no
 * way on, On Retry dispatches as before, and the decision already made stands
 * unless a handler ran, which may have moved the page, so the page is read
 * once more. A step that recorded no effect keeps the order above.
 */
export async function automationStudioStepStateRoute(
  ctx: AutomationStudioStepLoopContext,
  step: {
    node: AutomationStudioFlowNode;
    attempt: AutomationStudioNodeAttemptTrace;
    attemptIndex: number;
    regionId: string | undefined;
    routing: AutomationStudioStateRouteDecision | undefined;
    retryPolicy: AutomationStudioNodeRetryPolicy;
  }
): Promise<AutomationStudioStepOutcome> {
  if (!automationStudioTargetFailureProvesUnacted(step.attempt)) return { kind: "proceed" };
  const { flow, options, attempts, now } = ctx;
  const { node, attempt, attemptIndex, regionId } = step;
  const decide = () => decideAutomationStudioStateRoute({ flow, node, attempt, attempts, options, guard: ctx.routeGuard });
  // The readiness gate's decision, or the page read first for a step that recorded its own effect.
  const first = step.routing ?? (automationStudioNodeRouteSignatures(node).effect ? await decide() : undefined);
  const retried = step.routing || (first && first.kind !== "none") ? undefined : await automationStudioStepRetryBeforeRouting(ctx, { node, attempt, attemptIndex, retryPolicy: step.retryPolicy });
  if (retried && retried.outcome.kind !== "pass") {
    // The page was read and showed no way on: the attempt keeps that record under the handler's.
    if (first) attempts[attemptIndex] = automationStudioStateRoutedAttempt(attempts[attemptIndex]!, first);
    return afterRetryHandler(ctx, step, retried.outcome, retried.incidentId);
  }
  const routing = first && !retried?.outcome.lifecycle ? first : await decide();
  attempts[attemptIndex] = automationStudioStateRoutedAttempt(attempts[attemptIndex]!, routing);
  if (routing.kind !== "none") automationStudioStepStampFailureClass(ctx, attemptIndex, { uncertainAct: false, ...movedBy(routing.kind), onFail: [] }, retried?.incidentId);
  if (routing.kind === "stopped") return { kind: "return", trace: automationStudioEndedTrace(ctx, "failed", node.id, routing.message) };
  const routedTo = routing.kind === "routed" ? { toNodeId: routing.node.id, stateRoute: { direction: routing.direction } } : routing.kind === "declared" ? { toNodeId: routing.edge.targetNodeId, stateRoute: {} } : undefined;
  const stopsHere = routedTo ? ctx.stopAfter?.stops({ fromNodeId: node.id, ...routedTo }) : undefined;
  if (stopsHere) return { kind: "return", trace: ctx.stoppedAt(node.id, stopsHere) };
  announceAutomationStudioStateRoute(flow, node, routing);
  if (routing.kind === "routed") {
    if (routing.edge) recordRegionTransition(routing.edge, regionId, options, ctx.regionTransitions, now());
    return { kind: "next", node: routing.node };
  }
  if (routing.kind === "declared") {
    const skipEdge = routing.edge;
    const skipped = ctx.nodesById.get(skipEdge.targetNodeId);
    if (!skipped) return { kind: "return", trace: missingTargetTrace(ctx.startedAt, now(), skipEdge, attempts, ctx.values, ctx.effects) };
    recordRegionTransition(skipEdge, regionId, options, ctx.regionTransitions, now());
    return { kind: "next", node: skipped };
  }
  return { kind: "proceed" };
}

/** What an On Retry handler that did more than pass makes of the step: the run stops, moves to a checkpoint, or retries the step now. */
function afterRetryHandler(
  ctx: AutomationStudioStepLoopContext,
  step: { node: AutomationStudioFlowNode; attempt: AutomationStudioNodeAttemptTrace; attemptIndex: number; retryPolicy: AutomationStudioNodeRetryPolicy },
  outcome: Exclude<Awaited<ReturnType<typeof automationStudioStepRetryBeforeRouting>>, undefined>["outcome"],
  incidentId: string | undefined
): AutomationStudioStepOutcome {
  if (outcome.kind === "return") return outcome;
  if (outcome.kind === "route") {
    automationStudioStepStampFailureClass(ctx, step.attemptIndex, { uncertainAct: false, onFail: [{ kind: "handler", handlerId: outcome.lifecycle?.handlerId ?? "", when: "true", outcome: "route" }] }, incidentId);
    return { kind: "next", node: outcome.node };
  }
  // The handler cleared the way: the step is attempted again now, as the retry Core permitted.
  automationStudioStepStampFailureClass(ctx, step.attemptIndex, { uncertainAct: false, movedBy: "on_retry", onFail: [] }, incidentId);
  ctx.pendingRetry = { attemptNumber: ctx.arrival.attempts + 1, maxAttempts: step.retryPolicy.maxAttempts, backoffMs: 0, rung: "retry_node", previousAttemptId: step.attempt.attemptId };
  return { kind: "retry" };
}

/** A routing decision as the failure classifier reads it: the declared way on is a skip, anything else that moved the run a state route. */
function movedBy(kind: "declared" | "routed" | "stopped"): { movedBy?: "optional_way_on" | "state_route" } {
  if (kind === "declared") return { movedBy: "optional_way_on" };
  return kind === "routed" ? { movedBy: "state_route" } : {};
}
