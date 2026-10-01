import type { BackgroundTasksSnapshotResponse } from "fluxiq/background-tasks";
import { payloadFields as p } from "./primitives";
/** Guards consumed presentation fields; unrendered run/poll metadata is optional here. */
export function validateBackgroundSnapshot(value: unknown): value is BackgroundTasksSnapshotResponse {
  return p.record(value) && Array.isArray(value.tasks) && p.record(value.scheduler) && typeof value.scheduler.running === "boolean"
    && value.tasks.every(task => p.record(task) && p.string(task.id) && p.string(task.name) && p.string(task.queue) && typeof task.enabled === "boolean" && p.optionalString(task.schedule) && p.optionalNumber(task.intervalMs) && p.optionalNumber(task.lastRunAtMs) && p.nullableNumber(task.nextRunAtMs));
}
