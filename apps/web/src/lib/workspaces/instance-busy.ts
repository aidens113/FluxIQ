import type { FluxIQ } from "fluxiq";

/**
 * Whether an instance reports work in flight: a run or build holding a project
 * database, a background task running or turned on by a person, or a client
 * gateway session still connected (`GlobalProgramRuntime.activity()`).
 */
export function instanceBusy(fluxiq: FluxIQ): boolean {
  const activity = fluxiq.programs.activity();
  return activity.openProjectDatabases > 0
    || activity.backgroundTasksRunning > 0
    || activity.backgroundTasksScheduled > 0
    || activity.openGatewaySessions > 0;
}
