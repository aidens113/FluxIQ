// Whether an attempt proved its Flow: the saved steps, unchanged, ran from their start to their end
// with something really sent, and were judged yes, with no decision by a model and nothing left to
// the rounds. A repair, however good, has not been run whole as it now stands, so it waits for its
// own next run.

import type { AutomationStudioAnswerFirstProvenAttempt } from "./proven-attempt.ts";

export function automationStudioAnswerFirstProvenRun(run: Pick<AutomationStudioAnswerFirstProvenAttempt, "flowRun" | "route" | "path" | "decidedAfterRun" | "prior">, ending: string, stepsDigest: string): boolean {
  const { flowRun, route } = run;
  if (ending !== "achieved" || run.path !== "run_flow" || run.decidedAfterRun || run.prior) return false;
  if (flowRun?.judged !== "yes" || !flowRun.wentOut || flowRun.outcome.kind !== "ran" || !flowRun.outcome.reachedEnd) return false;
  return route.kind === "use" && route.saved.stepsDigest === stepsDigest;
}
