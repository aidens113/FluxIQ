import type { BackgroundTaskRun } from "fluxiq/background-tasks";
import { payloadFields as p } from "./primitives";
export function validateBackgroundRun(value: unknown): value is BackgroundTaskRun {
  return p.record(value) && p.string(value.id) && p.string(value.taskId) && p.string(value.status) && p.number(value.queuedAtMs) && p.optionalNumber(value.startedAtMs) && p.optionalNumber(value.finishedAtMs) && p.optionalString(value.error);
}
