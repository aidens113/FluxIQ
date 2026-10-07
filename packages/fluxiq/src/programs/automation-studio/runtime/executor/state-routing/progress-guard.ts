import type { AutomationStudioNodeAttemptTrace } from "../contracts.ts";

/**
 * How many times state routing may return the run to one node without the
 * run having made progress since the previous route there. The next return
 * ends the run as failed, and says so: a page that keeps sending the run back
 * to the same step is a loop, not a recovery.
 */
export const AUTOMATION_STUDIO_STATE_ROUTE_RETURN_LIMIT = 3;

/** The nodes whose body passes count as progress -- For Each and Repeat; keyed by definition id, as `graph-run.ts` keys them. */
const LOOP_DEFINITION_IDS: ReadonlySet<string> = new Set(["builtin.control.for-each", "builtin.control.repeat"]);

/**
 * The run's progress mark: the distinct nodes that acted successfully (that
 * succeeded and were not skipped), plus every For Each or Repeat pass into a
 * body.
 * It only ever grows, so a mark that has not moved between two routes into
 * one node means nothing new happened in between.
 */
export function automationStudioRunProgressMark(attempts: readonly AutomationStudioNodeAttemptTrace[]): number {
  const acted = new Set<string>();
  let passes = 0;
  for (const attempt of attempts) {
    if (attempt.status !== "succeeded" || attempt.skipped) continue;
    acted.add(attempt.nodeId);
    if (LOOP_DEFINITION_IDS.has(attempt.definitionId) && attempt.route === "body") passes += 1;
  }
  return acted.size + passes;
}

/** Whether a route may be taken, or how many returns without progress it would have been. */
export type AutomationStudioStateRouteAdmission = { admitted: true } | { admitted: false; returns: number };

/** One run's record of where state routing has sent it. */
export type AutomationStudioStateRouteGuard = {
  /**
   * Records a route into `nodeId` taken at progress `mark`, or refuses it.
   * A route whose mark has not moved since the previous route into the same
   * node is a return without progress; the one past
   * `AUTOMATION_STUDIO_STATE_ROUTE_RETURN_LIMIT` is refused. Any progress
   * resets the count, and routes into different nodes are counted apart.
   */
  admit(nodeId: string, mark: number): AutomationStudioStateRouteAdmission;
};

/** A fresh guard, one per run. */
export function automationStudioStateRouteGuard(): AutomationStudioStateRouteGuard {
  const routes = new Map<string, { mark: number; returns: number }>();
  return {
    admit(nodeId, mark) {
      const previous = routes.get(nodeId);
      const returns = previous && previous.mark === mark ? previous.returns + 1 : 0;
      if (returns > AUTOMATION_STUDIO_STATE_ROUTE_RETURN_LIMIT) return { admitted: false, returns };
      routes.set(nodeId, { mark, returns });
      return { admitted: true };
    }
  };
}
