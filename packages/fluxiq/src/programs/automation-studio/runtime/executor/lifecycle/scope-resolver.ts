// Which registered handlers may answer one lifecycle event at one node
// (state-aware recovery plan, C4 "Resolution").
//
// This module owns scope resolution as a pure function of the active frame
// stack, the registrations and the event. It does not evaluate `when`: the
// dispatcher observes every candidate's conditions in one batch and runs the
// first whose conditions are all `true`, one at a time. Nor does it count
// occurrences or budget (`./incident.ts`, `./budget-ledger.ts`).

import type { AutomationStudioLifecycleEvent } from "../../../nodes/control-flow/index.ts";
import type { AutomationStudioFrameStack } from "../frames/index.ts";
import type { AutomationStudioHandlerRegistration } from "./registration.ts";

/** The four resolution levels, nearest first. */
export type AutomationStudioHandlerLevel = "node" | "subflow" | "ancestor" | "automation";

/** One registration that may answer, with the level and frame it was found at. */
export type AutomationStudioHandlerCandidate = {
  registration: AutomationStudioHandlerRegistration;
  level: AutomationStudioHandlerLevel;
  /** The frame whose graph holds it; absent for automation scope, which belongs to no frame. */
  invocationId?: string;
};

const LEVEL_RANK: Readonly<Record<AutomationStudioHandlerLevel, number>> = { node: 0, subflow: 1, ancestor: 2, automation: 3 };

/**
 * The registrations that may answer `event` at `nodeId` in the stack's last
 * (executing) frame, in the order they are to be tried:
 *
 * 1. **node** -- a `nodes` scope naming `nodeId` exactly, stored in the
 *    executing frame's graph. A Call Subflow node's scope does not extend into
 *    its child: a child's node is not the call node, and the child frame runs
 *    another graph.
 * 2. **subflow** -- a `subflow` scope stored in the executing frame's graph.
 * 3. **ancestor** -- a `subflow` scope stored in an ancestor frame's graph,
 *    only when it `inherit`s; nearer ancestors first at equal order.
 * 4. **automation** -- an `automation` scope, from the recovery Subflow graph
 *    or an implicit interference registration (never the node's own).
 *
 * Within a level, ascending `order`, then document order. No confidence, no
 * match counting. Only the active frame stack counts: a registration stored in
 * a graph no active frame is running is never a candidate. While any frame is
 * running a handler body (cursor phase `handler`) nothing is returned, because
 * no handler is dispatched inside another (C5).
 */
export function resolveAutomationStudioHandlerCandidates(input: {
  stack: AutomationStudioFrameStack;
  registrations: readonly AutomationStudioHandlerRegistration[];
  event: AutomationStudioLifecycleEvent;
  nodeId: string;
}): AutomationStudioHandlerCandidate[] {
  const { stack, event, nodeId } = input;
  const current = stack[stack.length - 1];
  if (!current || stack.some((frame) => frame.cursor.phase === "handler")) return [];
  const found: Array<AutomationStudioHandlerCandidate & { distance: number }> = [];
  const seen = new Set<string>();
  const take = (candidate: AutomationStudioHandlerCandidate & { distance: number }): void => {
    if (seen.has(candidate.registration.handlerId)) return;
    seen.add(candidate.registration.handlerId);
    found.push(candidate);
  };
  const forEvent = input.registrations.filter((registration) => registration.event === event);
  for (const registration of forEvent) {
    if (registration.graphFlowId !== current.graphFlowId) continue;
    if (registration.scope.kind === "nodes" && registration.scope.nodeIds.includes(nodeId)) take({ registration, level: "node", invocationId: current.invocationId, distance: 0 });
  }
  for (const registration of forEvent) {
    if (registration.graphFlowId === current.graphFlowId && registration.scope.kind === "subflow") take({ registration, level: "subflow", invocationId: current.invocationId, distance: 0 });
  }
  for (let depth = stack.length - 2; depth >= 0; depth -= 1) {
    const ancestor = stack[depth]!;
    for (const registration of forEvent) {
      if (registration.graphFlowId !== ancestor.graphFlowId || registration.scope.kind !== "subflow" || !registration.scope.inherit) continue;
      take({ registration, level: "ancestor", invocationId: ancestor.invocationId, distance: stack.length - 1 - depth });
    }
  }
  for (const registration of forEvent) {
    if (registration.scope.kind !== "automation") continue;
    if (registration.source.kind === "clears_interference" && registration.source.nodeId === nodeId && registration.graphFlowId === current.graphFlowId) continue;
    take({ registration, level: "automation", distance: 0 });
  }
  return found
    .sort((left, right) => LEVEL_RANK[left.level] - LEVEL_RANK[right.level]
      || left.registration.order - right.registration.order
      || left.distance - right.distance
      || left.registration.documentIndex - right.registration.documentIndex
      || left.registration.handlerId.localeCompare(right.registration.handlerId))
    .map(({ registration, level, invocationId }) => (invocationId === undefined ? { registration, level } : { registration, level, invocationId }));
}
