import type { AutomationStudioNodeAttemptTrace } from "../contracts.ts";
import type { AutomationStudioStateRouteDecision } from "./decision.ts";

/**
 * The attempt of a step that could not run, as the decision leaves it.
 *
 * - `declared`: skipped, exactly as a sometimes-present step not shown always
 *   was: `status: "succeeded"`, `route: "skipped"`, `skipped.reason:
 *   "target_absent"`, no `failure`, `fault` or `message`.
 * - `routed`: the same shape under `route: "state_routed"`, with where the run
 *   went and which way, and the routing record. A step passed over because the
 *   page was elsewhere did not fail.
 * - `stopped` and `none`: still failed, carrying the routing record so a debug
 *   can see the runtime consulted the page.
 */
export function automationStudioStateRoutedAttempt(attempt: AutomationStudioNodeAttemptTrace, decision: AutomationStudioStateRouteDecision): AutomationStudioNodeAttemptTrace {
  if (decision.kind === "stopped" || decision.kind === "none") return { ...attempt, stateRouting: decision.record };
  const { failure, fault: _fault, message: _message, ...shown } = attempt;
  const code = failure?.code ?? "executor.target.not_found";
  if (decision.kind === "declared") return { ...shown, status: "succeeded", route: "skipped", skipped: { reason: "target_absent", code } };
  return {
    ...shown,
    status: "succeeded",
    route: "state_routed",
    skipped: { reason: "state_routed", code, toNodeId: decision.node.id, direction: decision.direction },
    stateRouting: decision.record
  };
}
