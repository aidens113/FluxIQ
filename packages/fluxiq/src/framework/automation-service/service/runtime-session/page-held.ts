import type { AutomationStudioRuntimeSession } from "../../../../flows/authoring/model/index.ts";
import type { AutomationStudioHostResourcePort } from "../../../../runtime/automation-host/index.ts";
import { AutomationStudioHostLeaseScope, automationStudioProjectHostLeaseScope } from "../../../../runtime/project-agents/index.ts";

/** What telling whether another run holds the project's page reads. */
export type AutomationStudioPageHeldPorts = {
  /** The host's resource port; absent on a host with nothing to lease, where only sessions can say. */
  hostResources: AutomationStudioHostResourcePort | undefined;
  listRuntimeSessions(projectId: string): Promise<AutomationStudioRuntimeSession[]>;
};

const ACTIVE_STATUSES: ReadonlySet<AutomationStudioRuntimeSession["status"]> = new Set(["queued", "running", "waiting"]);

/** What a person is told when the sessions cannot be read. The read's own error goes to the log. */
export const AUTOMATION_STUDIO_PAGE_CHECK_FAILED_MESSAGE = "FluxIQ could not check whether another run is using this page. Try again.";

/**
 * Whether another run holds this project's page, as the `pageHeld` port of
 * `admitAutomationStudioRuntimeSession`. Nothing here is a new lock: it reads what a part run
 * and a build already take (`../project-parts/run/driving-gate.ts`).
 *
 * Held means the calling context is not itself inside a lease scope (a build's own work holds
 * the page already) and either the host's scheduler reports a lease held with no capacity left,
 * or an active session in the project carries `metadata.partRun`. A listing that fails refuses
 * the run: nothing can say the page is free, and nothing says another run has it either, so
 * being told to wait for that run would be waiting for nothing. The person reads that it could
 * not be checked, and the store's own message goes to the log for whoever debugs it.
 */
export function automationStudioPageHeldReader(ports: AutomationStudioPageHeldPorts): (projectId: string) => Promise<boolean> {
  return async (projectId) => {
    if (AutomationStudioHostLeaseScope.current()) return false;
    if (ports.hostResources) {
      const { scheduler } = automationStudioProjectHostLeaseScope(ports.hostResources);
      if (scheduler.snapshot().held.length >= scheduler.capacity) return true;
    }
    let sessions: AutomationStudioRuntimeSession[];
    try {
      sessions = await ports.listRuntimeSessions(projectId);
    } catch (error) {
      console.error(`A run was refused because project ${projectId}'s runs could not be read: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error(AUTOMATION_STUDIO_PAGE_CHECK_FAILED_MESSAGE);
    }
    return sessions.some((session) => ACTIVE_STATUSES.has(session.status) && session.metadata?.partRun !== undefined);
  };
}
