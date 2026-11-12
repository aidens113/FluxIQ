import type { BackgroundTaskDefinition, BackgroundTaskRun } from "fluxiq/background-tasks";
import { payloadFields as p } from "./primitives";
import { validateBackgroundRun } from "./validateBackgroundRun";
type RunPage = { task?: BackgroundTaskDefinition; runs: BackgroundTaskRun[]; total: number; limit: number; offset: number };
export function validateBackgroundRunPage(value: unknown): value is RunPage {
  return p.record(value) && Array.isArray(value.runs) && value.runs.every(validateBackgroundRun) && p.number(value.total) && Number.isInteger(value.total) && value.total >= 0 && value.limit === 50 && p.number(value.offset) && Number.isInteger(value.offset) && value.offset >= 0;
}
