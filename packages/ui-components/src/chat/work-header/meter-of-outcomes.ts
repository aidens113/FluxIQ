// The header's meter, read from a thread's outcomes: the attempt still working, its spend
// so far and its budget. A port whose records carry no real spend (`reportsSpend === false`)
// gives no cost, so the header never shows a made-up "$0.00".

import type { ChatResultsPort, ChatTaskOutcome } from "../ports/index.ts";
import type { WorkMeter } from "./work-header-model.ts";

/** The meter for the newest attempt still working, or none. */
export function meterOfOutcomes(outcomes: readonly ChatTaskOutcome[], results: Pick<ChatResultsPort, "reportsSpend"> | undefined): WorkMeter | undefined {
  const working = outcomes.filter((outcome) => outcome.attempt.status === "working").at(-1)?.attempt;
  if (working === undefined) return undefined;
  const meter: WorkMeter = { startedAtMs: working.startedAtMs };
  if (results?.reportsSpend !== false) {
    meter.usd = working.spend.usd;
    meter.budgetUsd = working.budget.usd;
  }
  return meter;
}
