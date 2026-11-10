import type { HomeRun } from "./types";

export type TodaySummary = {
  runs: number;
  passed: number;
  failed: number;
  /** Dollars the engine recorded for today's runs; null when none of them recorded a cost. */
  spendUsd: number | null;
};

/** Today's runs, from the start of the person's local day. Spend adds only the costs that were recorded. */
export function todaySummary(runs: readonly HomeRun[], now: number): TodaySummary {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  const today = runs.filter((run) => run.startedAt >= day.getTime() && run.startedAt <= now);
  const costs = today.flatMap((run) => (run.costUsd === undefined ? [] : [run.costUsd]));
  return {
    runs: today.length,
    passed: today.filter((run) => run.status === "succeeded").length,
    failed: today.filter((run) => run.status === "failed").length,
    spendUsd: costs.length ? costs.reduce((sum, cost) => sum + cost, 0) : null
  };
}
