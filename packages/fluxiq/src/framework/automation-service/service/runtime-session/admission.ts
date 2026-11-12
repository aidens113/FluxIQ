import type { AutomationStudioRuntimeSession } from "../../../../flows/authoring/model/index.ts";
import { AutomationStudioHostLeaseScope } from "../../../../runtime/project-agents/host-resources/index.ts";

/** What admitting a run reaches the service for. */
export type AutomationStudioRuntimeSessionAdmissionPorts = {
  /** Projects whose adaptive run is between its admission check and its session's first write. */
  admissions: Set<string>;
  listRuntimeSessions(projectId: string): Promise<AutomationStudioRuntimeSession[]>;
  /**
   * Whether another run holds the project's page (`./page-held.ts`). Asked of every run with a
   * project, adaptive or not, before its session is written. Absent, nothing is asked.
   */
  pageHeld?(projectId: string): Promise<boolean>;
  /** Writes the new run's `queued` session. */
  startRuntimeSession(): Promise<AutomationStudioRuntimeSession>;
};

/**
 * What a run is told when another holds the project's page. A part run answers with the same
 * words (`../project-parts/run/driving-gate.ts`), so a person reads one sentence either way.
 */
export const AUTOMATION_STUDIO_PAGE_HELD_MESSAGE = "Another run is using this project's page right now, so this part was not run and nothing changed. Try again when that run has ended.";

const ACTIVE_STATUSES: ReadonlySet<AutomationStudioRuntimeSession["status"]> = new Set(["queued", "running", "waiting"]);

/**
 * Starts a new run's session, holding adaptive runs to one per project.
 *
 * The check reads every session in the project, and a listing that fails
 * refuses the run. Read as "no sessions", it would admit a second adaptive run
 * beside one that is still going.
 */
export async function admitAutomationStudioRuntimeSession(
  ports: AutomationStudioRuntimeSessionAdmissionPorts,
  projectId: string | null | undefined,
  adaptive: boolean
): Promise<AutomationStudioRuntimeSession> {
  if (projectId && ports.pageHeld && await ports.pageHeld(projectId)) throw new Error(AUTOMATION_STUDIO_PAGE_HELD_MESSAGE);
  const lease = AutomationStudioHostLeaseScope.current();
  // A concrete, current resource lease already excludes every other driver
  // of that browser. Independent resources in one project may run together;
  // a stale async frame confers no such admission.
  if (lease?.sessionId !== undefined && AutomationStudioHostLeaseScope.gatewaySource.isCurrent(lease)
    && AutomationStudioHostLeaseScope.gatewaySource.requiresLease?.(lease.sessionId) === true) return await ports.startRuntimeSession();
  if (!projectId || !adaptive) return await ports.startRuntimeSession();
  if (ports.admissions.has(projectId)) throw new Error("Only one adaptive runtime run can be admitted per project at a time.");
  ports.admissions.add(projectId);
  try {
    const active = (await ports.listRuntimeSessions(projectId)).filter((candidate) =>
      ACTIVE_STATUSES.has(candidate.status) && candidate.metadata?.adaptiveRuntime === true);
    if (active.length >= 1) throw new Error("Only one adaptive runtime run can be active per project.");
    return await ports.startRuntimeSession();
  } finally {
    ports.admissions.delete(projectId);
  }
}
