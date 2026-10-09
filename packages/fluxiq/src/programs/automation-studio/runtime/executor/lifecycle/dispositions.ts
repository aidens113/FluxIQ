// What a handler's written disposition does at run time (state-aware recovery
// plan, C5's table).
//
// This module owns the run-time decision. The static half of the table (which
// disposition may be written at which event) is
// `automationStudioDispositionAllowedAt` in `nodes/control-flow/handler-end.ts`,
// which the validator applies at save; it is applied again here so a graph
// saved before validation knew of it still cannot resume past a failure.

import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioDispositionAllowedAt } from "../../../nodes/control-flow/index.ts";
import type { AutomationStudioFactTruth } from "./fact-condition.ts";
import type { AutomationStudioHandlerDisposition, AutomationStudioLifecycleContinuation } from "./continuation.ts";

/** Core outcomes no handler can override. */
export type AutomationStudioCoreStop = "pause" | "cancel" | "permission" | "outcome_uncertain";

/**
 * What the dispatcher found about a Route's target after the body ran,
 * re-observed when the body changed the page.
 */
export type AutomationStudioRouteCheck = {
  /** The checkpoint id names a checkpoint in the current or an ancestor frame. */
  found: boolean;
  /** The checkpoint's `when` conditions, all together. */
  when: AutomationStudioFactTruth;
  /** Every `requires` name is bound. */
  requiresBound: boolean;
  /** The route would move past a node whose lasting act is `uncertain`. */
  passesUncertainAct: boolean;
  /** The route re-enters a path that would repeat a completed `reconcile` act. */
  repeatsCompletedReconcile: boolean;
  /** That act's effect check, when one was asked. */
  effectCheck?: "landed" | "not_landed" | "unknown";
};

/** What the run does next. `unhandled` carries why, so the trace never has to guess. */
export type AutomationStudioDispositionDecision =
  | { kind: "resume" }
  | { kind: "route"; checkpointId: string }
  | { kind: "resolve"; outputs: JsonObject }
  | { kind: "unhandled"; reason: string }
  | { kind: "stop"; stop: AutomationStudioCoreStop; reason: string };

/**
 * Decides a written disposition, in this order:
 *
 * 1. A Core stop (pause, cancel, a permission, `Outcome uncertain`) stands.
 *    So does an uncertain lasting act at the boundary: no disposition moves
 *    past it, and the run stops as `Outcome uncertain`.
 * 2. A body that failed returns `unhandled`.
 * 3. A disposition the table refuses at this event is `unhandled`: `resume` at
 *    `fail`, `resolve` anywhere but `fail`.
 * 4. A `completionCheck` that is not `true` makes it `unhandled`, whatever was
 *    written. (An empty check holds, which is what a `fail` handler with none
 *    has; `before` and `retry` handlers must declare one at validation.)
 * 5. A `route` needs a checkpoint that exists, whose `when` is `true` and
 *    whose `requires` are bound; it never moves past an uncertain act, and
 *    re-entering a completed `reconcile` act needs its effect check to say
 *    `not_landed`.
 * 6. A `resolve` must cover `requiredOutputIds`, the failed node's (or
 *    frame's) output contract.
 * 7. `unhandled` written is `unhandled`; the ladder continues at the next level.
 */
export function decideAutomationStudioDisposition(input: {
  continuation: AutomationStudioLifecycleContinuation;
  written: AutomationStudioHandlerDisposition;
  completionCheck: AutomationStudioFactTruth;
  bodyFailed?: boolean;
  coreStop?: AutomationStudioCoreStop;
  route?: AutomationStudioRouteCheck;
  requiredOutputIds?: readonly string[];
}): AutomationStudioDispositionDecision {
  const { continuation, written } = input;
  if (input.coreStop) return { kind: "stop", stop: input.coreStop, reason: `The run's ${input.coreStop} stop is a Core outcome no handler overrides.` };
  if (continuation.lastingActStatus === "uncertain") {
    return { kind: "stop", stop: "outcome_uncertain", reason: `${continuation.nodeId} may already have acted and nothing settled it, so no handler moves the run past it.` };
  }
  if (input.bodyFailed) return unhandled("The handler's body failed.");
  if (!automationStudioDispositionAllowedAt(continuation.event, written.kind)) {
    return unhandled(`"${written.kind}" is not a disposition a ${continuation.event} handler may end with.`);
  }
  if (input.completionCheck !== "true") return unhandled(`The handler's completion check is ${input.completionCheck}, not true.`);
  switch (written.kind) {
    case "unhandled":
      return unhandled("The handler ended unhandled.");
    case "resume":
      return { kind: "resume" };
    case "route":
      return routeDecision(written.checkpointId, input.route);
    case "resolve": {
      const missing = (input.requiredOutputIds ?? []).filter((outputId) => written.outputs[outputId] === undefined);
      if (missing.length) return unhandled(`The resolve does not supply the required output${missing.length === 1 ? "" : "s"} ${missing.join(", ")}.`);
      return { kind: "resolve", outputs: written.outputs };
    }
  }
}

function routeDecision(checkpointId: string, check: AutomationStudioRouteCheck | undefined): AutomationStudioDispositionDecision {
  if (!check?.found) return unhandled(`No checkpoint "${checkpointId}" is in this frame or a frame that called it.`);
  if (check.when !== "true") return unhandled(`Checkpoint "${checkpointId}" does not hold: its conditions are ${check.when}.`);
  if (!check.requiresBound) return unhandled(`Checkpoint "${checkpointId}" needs a value that is not bound.`);
  if (check.passesUncertainAct) return unhandled(`The route to "${checkpointId}" would move past an act whose outcome is uncertain.`);
  if (check.repeatsCompletedReconcile && check.effectCheck !== "not_landed") {
    return unhandled(`The route to "${checkpointId}" would repeat a completed act whose effect check says ${check.effectCheck ?? "nothing"}, not not_landed.`);
  }
  return { kind: "route", checkpointId };
}

function unhandled(reason: string): AutomationStudioDispositionDecision {
  return { kind: "unhandled", reason };
}
