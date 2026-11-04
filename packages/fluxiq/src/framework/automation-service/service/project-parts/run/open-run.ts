import type { AutomationStudioRunControlGate } from "../../../../../runtime/automation-host/index.ts";
import type { AutomationStudioProjectPartOpenRun } from "./types.ts";

/**
 * A part run registered as any run of the service is, so a person pauses it, takes it
 * over and stops it the same way, and closed again when the run ends.
 */
export function automationStudioOpenPartRun(holders: { abortControllers: Map<string, AbortController>; runControl: { open(projectId: string, runId: string, signal: AbortSignal): AutomationStudioRunControlGate; close(projectId: string, runId: string): void } }, projectId: string, runId: string, abort: AbortController): AutomationStudioProjectPartOpenRun {
  const key = `${projectId}:${runId}`;
  holders.abortControllers.set(key, abort);
  return {
    gate: holders.runControl.open(projectId, runId, abort.signal),
    close: () => {
      holders.abortControllers.delete(key);
      holders.runControl.close(projectId, runId);
    }
  };
}
