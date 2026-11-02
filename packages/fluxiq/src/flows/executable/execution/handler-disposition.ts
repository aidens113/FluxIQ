/**
 * How a handler body ended once the dispatcher decided it (C5). An
 * `unhandled` keeps why, as the executor's closed codes
 * (`runtime/executor/lifecycle/unhandled-reason.ts`, t411): the body's own
 * ending, a check that did not hold, a refused route and the `guard` that
 * refused it, a spent budget. Absent on a record from before t411.
 */
export type AutomationStudioFlowRunHandlerDisposition =
  | { kind: "resume" }
  | { kind: "route"; checkpointId: string }
  | { kind: "resolve" }
  | {
    kind: "unhandled";
    reason?: "written_unhandled" | "body_failed" | "completion_check_not_true" | "disposition_not_allowed" | "resolve_missing_outputs" | "route_refused" | "budget_spent" | "already_tried" | "no_body" | "core_stop";
    guard?: "checkpoint_not_found" | "checkpoint_not_holding" | "requires_unbound" | "passes_uncertain_act" | "unreachable" | "unguarded" | "repeats_unrecorded_act";
  };
