// The live runs a host can pause, keyed the way the host keys its abort
// controllers: `${projectId}:${runId}`.
//
// A run is opened here when it starts executing and closed when it ends, in
// the same place the host sets and deletes the run's abort controller. Only an
// open run can be paused; a run that is queued, parked on a question, over, or
// executing in another process is not live here, and asking to pause it
// answers with no control rather than an error, the way stopping a run that is
// already over answers with the run as it ended.

import { AutomationStudioRunController } from "./run-controller.ts";
import type { AutomationStudioRunControlHolder, AutomationStudioRunControlPhase, AutomationStudioRunControlSnapshot } from "./types.ts";

export type AutomationStudioRunControlRegistryOptions = {
  now?: () => number;
  maxPausedMs?: number;
};

export class AutomationStudioRunControlRegistry {
  private readonly controllers = new Map<string, AutomationStudioRunController>();

  constructor(private readonly options: AutomationStudioRunControlRegistryOptions = {}) {}

  /**
   * The gate for a run that is starting to execute. Opening a run already open
   * hands back the same gate, so a rerun that reuses the run's options is the
   * same run to a person holding it.
   */
  open(projectId: string, runId: string, signal?: AbortSignal): AutomationStudioRunController {
    const key = runKey(projectId, runId);
    const existing = this.controllers.get(key);
    if (existing) return existing;
    const controller = new AutomationStudioRunController({
      projectId,
      runId,
      ...(signal ? { signal } : {}),
      ...(this.options.now ? { now: this.options.now } : {}),
      ...(this.options.maxPausedMs !== undefined ? { maxPausedMs: this.options.maxPausedMs } : {})
    });
    this.controllers.set(key, controller);
    return controller;
  }

  /** The run has ended. Returns what its control came to, for the run's record, or null if it was never open. */
  close(projectId: string, runId: string): AutomationStudioRunControlSnapshot | null {
    const key = runKey(projectId, runId);
    const controller = this.controllers.get(key);
    if (!controller) return null;
    this.controllers.delete(key);
    return controller.dispose();
  }

  pause(projectId: string, runId: string, input: { holder?: AutomationStudioRunControlHolder; reason?: string } = {}): AutomationStudioRunControlSnapshot | null {
    return this.controllers.get(runKey(projectId, runId))?.pause(input) ?? null;
  }

  resume(projectId: string, runId: string, input: { afterManualAction?: boolean; note?: string } = {}): AutomationStudioRunControlSnapshot | null {
    return this.controllers.get(runKey(projectId, runId))?.resume(input) ?? null;
  }

  setPhase(projectId: string, runId: string, phase: AutomationStudioRunControlPhase): void {
    this.controllers.get(runKey(projectId, runId))?.setPhase(phase);
  }

  snapshot(projectId: string, runId: string): AutomationStudioRunControlSnapshot | null {
    return this.controllers.get(runKey(projectId, runId))?.snapshot() ?? null;
  }
}

function runKey(projectId: string, runId: string): string {
  return `${projectId}:${runId}`;
}
