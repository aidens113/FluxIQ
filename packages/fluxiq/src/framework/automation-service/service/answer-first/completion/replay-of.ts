// The replay a completion closes, when it is one (task speed S9): the saved Flow the attempt started
// from, run whole by the Flow run stage, and nothing done since. Anything else is not a replay of the
// record, and its completion is judged as before.
//
//   the attempt did not start from a saved Flow it runs (`route` not `use`)     none
//   it carries on an earlier attempt, which never runs the Flow again            none
//   its path has left the Flow run (a repair or round after it, or no run yet)   none
//   the run did not run (refused, declined, stopped)                             none
//
// Read when the completion asks, so it is the run as it stands at that moment.

import type { AutomationStudioAnswerFirstFlowRunOutcome } from "../flow-run/index.ts";
import type { AutomationStudioAnswerFirstSavedFlow } from "../task-memory/index.ts";
import type { AutomationStudioAnswerFirstReplayRecord } from "./replay-record.ts";

/** The path a Flow run stage is on while its run is what the attempt has (`../attempt/flow-stage.ts`). */
const RUN_FLOW = "run_flow";

export function automationStudioAnswerFirstReplayOf(run: {
  route: { kind: string; saved?: Pick<AutomationStudioAnswerFirstSavedFlow, "label" | "provenWhole" | "shape"> };
  prior?: unknown;
  path: string;
  flowRun?: { outcome: AutomationStudioAnswerFirstFlowRunOutcome } | undefined;
}): AutomationStudioAnswerFirstReplayRecord | undefined {
  const saved = run.route.kind === "use" ? run.route.saved : undefined;
  const outcome = run.flowRun?.outcome;
  if (!saved || run.prior !== undefined || run.path !== RUN_FLOW || outcome?.kind !== "ran") return undefined;
  return {
    saved: { label: saved.label, provenWhole: saved.provenWhole, ...(saved.shape ? { shape: saved.shape } : {}) },
    reachedEnd: outcome.reachedEnd,
    steps: outcome.steps,
    repaired: false
  };
}
