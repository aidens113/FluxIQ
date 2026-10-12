// What a node's failure counts as (state-aware recovery plan, C6, "What counts
// as a true failure").
//
// This module owns the classification. Only a `true_failure` reaches in-run
// model repair (C6 step 8); retries, planned fails, deliberate stops, skips
// and state routes never call a model, and traces, the chat and the measures
// count each separately. An uncertain lasting act is neither a failure nor a
// success: it stops as `Outcome uncertain`, which no repair overrides.

import type { AutomationStudioFactTruth } from "./fact-condition.ts";

/**
 * How one On Fail path at the failing node, or at any scope above it, stands.
 *
 * - `edge`: an authored `failed` edge or `error.<id>` port to another node.
 *   `deliberateStop` when that node ends the run on purpose (an End with
 *   `resultStatus: failed`, or another deliberate stop).
 * - `handler`: an On Fail handler. `when` is its conditions together; a
 *   handler whose `when` is not `true` does not apply. `outcome` is how it
 *   ended once run; absent while it has not run.
 */
export type AutomationStudioOnFailPath =
  | { kind: "edge"; edgeId: string; targetNodeId: string; deliberateStop: boolean }
  | {
    kind: "handler";
    handlerId: string;
    when: AutomationStudioFactTruth;
    outcome?: "resume" | "route" | "resolve" | "unhandled" | "body_failed" | "completion_not_true";
  };

/**
 * What a failure counts as:
 * - `outcome_uncertain`: a lasting act may have landed and its effect check said `unknown`;
 * - `retry_superseded`: another attempt is permitted (an On Retry handler or the retry floor);
 * - `skip`: the step's state already held, its effect check said `landed`, or it
 *   was an optional step the run went on past;
 * - `state_route`: state routing moved the run to the node the page is at;
 * - `planned_fail`: an On Fail path took the run to another node, or a handler resolved it;
 * - `deliberate_stop`: the On Fail path leads to an authored stop, which ends the run with its own reason;
 * - `on_fail_pending`: an On Fail handler applies and has not run yet -- dispatch it first;
 * - `true_failure`: nothing above applies; the only trigger for in-run repair.
 */
export type AutomationStudioFailureClass =
  | "outcome_uncertain"
  | "retry_superseded"
  | "skip"
  | "state_route"
  | "planned_fail"
  | "deliberate_stop"
  | "on_fail_pending"
  | "true_failure";

/** The earlier rung that moved the run on, when one did (C6 steps 3-5). */
export type AutomationStudioEarlierRung = "satisfied" | "effect_landed" | "optional_way_on" | "on_retry" | "retry" | "state_route";

/**
 * Classifies one failure from what the ladder has established so far. A child
 * frame's true failure is classified again at its Call Subflow node in the
 * parent, carrying the same incident, so a parent On Fail path that handles
 * it makes it a planned fail of the parent.
 */
export function classifyAutomationStudioFailure(input: {
  /** The node's lasting act may have landed and its effect check answered `unknown`. */
  uncertainAct: boolean;
  /** The earlier rung that moved the run on, if any. */
  movedBy?: AutomationStudioEarlierRung;
  /** Every On Fail path at node, frame, ancestor and automation scope, in dispatch order. */
  onFail: readonly AutomationStudioOnFailPath[];
}): AutomationStudioFailureClass {
  if (input.uncertainAct) return "outcome_uncertain";
  switch (input.movedBy) {
    case "on_retry":
    case "retry":
      return "retry_superseded";
    case "satisfied":
    case "effect_landed":
    case "optional_way_on":
      return "skip";
    case "state_route":
      return "state_route";
    case undefined:
      break;
  }
  for (const path of input.onFail) {
    if (path.kind === "edge") return path.deliberateStop ? "deliberate_stop" : "planned_fail";
    if (path.when !== "true") continue;
    if (path.outcome === undefined) return "on_fail_pending";
    if (path.outcome === "resume" || path.outcome === "route" || path.outcome === "resolve") return "planned_fail";
  }
  return "true_failure";
}
