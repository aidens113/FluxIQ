import { asRecord } from "./as-record";
import { numberOf } from "./number-of";
import { textOf } from "./text-of";
import type { HomeRun } from "./types";

/**
 * One run summary from `list-flow-runs` as Home reads it. A row without a run id or a Flow is dropped
 * (nothing to link to); a missing start falls back to when the run last changed; a missing cost stays missing.
 */
export function shapeRun(raw: unknown, flowNames: ReadonlyMap<string, string>): HomeRun | undefined {
  const row = asRecord(raw);
  const runId = textOf(row?.runId);
  const flowId = textOf(row?.flowId);
  if (!row || !runId || !flowId) return undefined;
  const startedAt = numberOf(row.startedAt) ?? numberOf(row.updatedAt);
  if (startedAt === undefined) return undefined;
  const run: HomeRun = {
    runId,
    flowId,
    projectId: textOf(row.projectId) ?? "",
    flowName: flowNames.get(flowId) ?? "A Flow",
    status: textOf(row.status) ?? "unknown",
    startedAt
  };
  const finishedAt = numberOf(row.finishedAt);
  if (finishedAt !== undefined) run.finishedAt = finishedAt;
  const cost = numberOf(asRecord(row.tokenUsage)?.estimatedCostUsd);
  if (cost !== undefined) run.costUsd = cost;
  return run;
}
