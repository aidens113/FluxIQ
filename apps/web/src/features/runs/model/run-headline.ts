import { runDuration, runResult } from "../../home/model";
import { formatSpend } from "../../panel-shell/top-bar";
import { confirmedByLabel } from "./confirmed-by-label";
import type { RunRow } from "./types";

/** "Cheapest listings · Passed (confirmed by your check) · $0.00 · 6 s": the run page's one-line answer. */
export function runHeadline(row: RunRow): string {
  const confirmed = confirmedByLabel(row.confirmedBy);
  const parts = [row.flowName, `${runResult(row.status).label}${confirmed ? ` (${confirmed})` : ""}`];
  if (row.costUsd !== undefined) parts.push(formatSpend(row.costUsd));
  const took = runDuration(row);
  if (took) parts.push(took);
  return parts.join(" · ");
}
