import { agoText, runResult, type HomeTone } from "../../home/model";
import { formatSpend } from "../../panel-shell/top-bar";
import { clientLabel } from "./client-label";
import type { RunRow } from "./types";

/** One list row in plain words: the Flow, how it went, and the small facts in reading order. */
export type RunFacts = { flowName: string; result: { label: string; tone: HomeTone }; details: string[] };

/** Only facts the run recorded appear; a cost it did not record says so rather than showing $0.00. */
export function runFacts(row: RunRow, now: number): RunFacts {
  const details: string[] = [];
  if (row.howRan) details.push(row.howRan);
  details.push(row.costUsd === undefined ? "cost not recorded" : formatSpend(row.costUsd));
  if (row.steps !== undefined) details.push(`${row.steps} ${row.steps === 1 ? "step" : "steps"}`);
  if (row.client) details.push(clientLabel(row.client));
  if (row.startedBy) details.push(`started by ${row.startedBy}`);
  details.push(agoText(row.startedAt, now));
  return { flowName: row.flowName, result: runResult(row.status), details };
}
