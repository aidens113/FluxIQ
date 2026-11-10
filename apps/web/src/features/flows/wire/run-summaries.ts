import { asRecord, numberOf, textOf } from "../../home/model";
import type { RunSummary } from "./types";

/** `list-flow-runs`' runs. A row without a run, a Flow or a time is dropped; a missing cost stays missing. Undefined when there is no list. */
export function runSummaries(payload: unknown): RunSummary[] | undefined {
  const runs = asRecord(payload)?.runs;
  if (!Array.isArray(runs)) return undefined;
  return runs.flatMap((value): RunSummary[] => {
    const row = asRecord(value);
    const runId = textOf(row?.runId);
    const flowId = textOf(row?.flowId);
    const startedAt = numberOf(row?.startedAt) ?? numberOf(row?.updatedAt);
    if (!row || !runId || !flowId || startedAt === undefined) return [];
    const costUsd = numberOf(asRecord(row.tokenUsage)?.estimatedCostUsd);
    return [{ runId, flowId, status: textOf(row.status) ?? "unknown", startedAt, ...(costUsd === undefined ? {} : { costUsd }) }];
  });
}
