import type { ProductionRun } from "fluxiq/production-runner";
import { shortJson } from "../../../programs/format";

export type ProductionLogRow = { id: string; atMs: number; target: string; loop: string; status: string; message: string; type: string };

export function flattenRunLogs(runs: ProductionRun[]): ProductionLogRow[] {
  return runs.flatMap((run) => {
    const executions = run.executions ?? [];
    if (!executions.length) return [{ id: `${run.id}:summary`, atMs: run.updatedAtMs ?? run.startedAtMs ?? 0, target: run.targetId ?? run.name, loop: `${run.loopsCompleted ?? 0}/${run.loopsTotal ?? 1}`, status: run.status, message: String(run.metadata?.message ?? "-"), type: run.targetType ?? "run" }];
    return executions.map((execution) => ({ id: `${run.id}:${execution.loop}`, atMs: execution.atMs, target: run.targetId ?? run.name, loop: `${execution.loop}/${run.loopsTotal ?? 1}`, status: execution.ok ? "success" : "failed", message: execution.error ?? shortJson(execution.result), type: run.targetType ?? "run" }));
  });
}
