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
import type { AutomationStudioRouteRefusalGuard, AutomationStudioUnhandledReason } from "./unhandled-reason.ts";

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
  /**
   * The route would move past a node whose lasting act is `uncertain`. A
   * route back past acts that completed is not refused: the run's
   * completed-act ledger skips each of them as already done when the run
   * reaches it again, so none is repeated (`../step-loop/already-done.ts`).
   */
  passesUncertainAct: boolean;
  /** The route goes back past a completed act the ledger does not hold, which nothing would skip. */
  repeatsUnrecordedAct?: boolean;
};

/**
 * What the run does next. `unhandled` carries why, so the trace never has to
 * guess: `reason` in words, `code` as a closed code, and `guard` naming the
 * guard that refused a route (`./unhandled-reason.ts`).
 */
export type AutomationStudioDispositionDecision =
  | { kind: "resume" }
  | { kind: "route"; checkpointId: string }
  | { kind: "resolve"; outputs: JsonObject }
  | { kind: "unhandled"; reason: string; code: AutomationStudioUnhandledReason; guard?: AutomationStudioRouteRefusalGuard }
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
 *    whose `requires` are bound; it never moves past an uncertain act. It may
 *    go back past completed acts: none is repeated, because the run skips an
 *    act its completed-act ledger holds as already done. One the ledger does
 *    not hold (a resumed run's) still refuses it.
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
  if (input.bodyFailed) return unhandled("body_failed", "The handler's body failed.");
  if (!automationStudioDispositionAllowedAt(continuation.event, written.kind)) {
    return unhandled("disposition_not_allowed", `"${written.kind}" is not a disposition a ${continuation.event} handler may end with.`);
  }
  if (input.completionCheck !== "true") return unhandled("completion_check_not_true", `The handler's completion check is ${input.completionCheck}, not true.`);
  switch (written.kind) {
    case "unhandled":
      return unhandled("written_unhandled", "The handler ended unhandled.");
    case "resume":
      return { kind: "resume" };
    case "route":
      return routeDecision(written.checkpointId, input.route);
    case "resolve": {
      const missing = (input.requiredOutputIds ?? []).filter((outputId) => written.outputs[outputId] === undefined);
      if (missing.length) return unhandled("resolve_missing_outputs", `The resolve does not supply the required output${missing.length === 1 ? "" : "s"} ${missing.join(", ")}.`);
      return { kind: "resolve", outputs: written.outputs };
    }
  }
}

function routeDecision(checkpointId: string, check: AutomationStudioRouteCheck | undefined): AutomationStudioDispositionDecision {
  if (!check?.found) return refused("checkpoint_not_found", `No checkpoint "${checkpointId}" is in this frame or a frame that called it.`);
  if (check.when !== "true") return refused("checkpoint_not_holding", `Checkpoint "${checkpointId}" does not hold: its conditions are ${check.when}.`);
  if (!check.requiresBound) return refused("requires_unbound", `Checkpoint "${checkpointId}" needs a value that is not bound.`);
  if (check.passesUncertainAct) return refused("passes_uncertain_act", `The route to "${checkpointId}" would move past an act whose outcome is uncertain.`);
  if (check.repeatsUnrecordedAct) return refused("repeats_unrecorded_act", `The route to "${checkpointId}" would go back past a completed act this run has no record of, so it could be done twice.`);
  return { kind: "route", checkpointId };
}

function unhandled(code: AutomationStudioUnhandledReason, reason: string): AutomationStudioDispositionDecision {
  return { kind: "unhandled", reason, code };
}

function refused(guard: AutomationStudioRouteRefusalGuard, reason: string): AutomationStudioDispositionDecision {
  return { kind: "unhandled", reason, code: "route_refused", guard };
}
