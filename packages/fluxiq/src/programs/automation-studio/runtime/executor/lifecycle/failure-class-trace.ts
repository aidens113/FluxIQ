// The classifier's verdict as an attempt trace records it (state-aware recovery
// plan, C6 "What counts as a true failure", and C11).
//
// This module owns the one mapping from `./true-failure.ts`'s verdicts to the
// trace's closed `failureClass` vocabulary (`../contracts.ts`). A deliberate
// stop is a planned fail on the trace: the run ends with its authored reason,
// and the chat never words it as a failure. `on_fail_pending` is a step in the
// dispatcher, not an outcome, so it is never recorded.

import type { AutomationStudioTraceFailureClass } from "../contracts.ts";
import type { AutomationStudioFailureClass } from "./true-failure.ts";

const TRACE_CLASS: Readonly<Record<AutomationStudioFailureClass, AutomationStudioTraceFailureClass | undefined>> = Object.freeze({
  true_failure: "true_failure",
  planned_fail: "planned_fail",
  deliberate_stop: "planned_fail",
  retry_superseded: "retry",
  skip: "skip",
  state_route: "state_route",
  outcome_uncertain: "uncertain",
  on_fail_pending: undefined
});

/** The trace's `failureClass` for a verdict, or `undefined` for `on_fail_pending`, which is never recorded. */
export function automationStudioTraceFailureClass(verdict: AutomationStudioFailureClass): AutomationStudioTraceFailureClass | undefined {
  return TRACE_CLASS[verdict];
}
