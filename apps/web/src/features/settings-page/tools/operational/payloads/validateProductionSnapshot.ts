import type { ProductionRunnerSnapshotResponse } from "fluxiq/production-runner";
import { payloadFields as p } from "./primitives";
export function validateProductionSnapshot(value: unknown): value is ProductionRunnerSnapshotResponse {
  return p.record(value) && Array.isArray(value.targets) && Array.isArray(value.runs)
    && value.targets.every(target => p.record(target) && p.string(target.id) && p.string(target.name) && p.string(target.type) && p.nullableString(target.domainId) && p.optionalString(target.description) && p.optionalRecord(target.metadata))
    && value.runs.every(validRun);
}
function validRun(run: unknown) {
  return p.record(run) && p.string(run.id) && p.string(run.name) && p.string(run.status) && p.optionalString(run.targetType) && p.optionalString(run.targetId) && p.optionalRecord(run.metadata)
    && [run.loopsTotal, run.loopsCompleted, run.startedAtMs, run.updatedAtMs].every(p.optionalNumber) && p.nullableNumber(run.nextRunAtMs)
    && (run.executions === undefined || Array.isArray(run.executions) && run.executions.every(execution => p.record(execution) && p.number(execution.loop) && p.number(execution.atMs) && typeof execution.ok === "boolean" && p.optionalString(execution.error)));
}
