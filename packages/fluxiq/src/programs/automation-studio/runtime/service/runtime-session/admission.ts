import type { AutomationStudioRuntimeSession } from "../../../model/index.ts";

/** What admitting a run reaches the service for. */
export type AutomationStudioRuntimeSessionAdmissionPorts = {
  /** Projects whose adaptive run is between its admission check and its session's first write. */
  admissions: Set<string>;
  listRuntimeSessions(projectId: string): Promise<AutomationStudioRuntimeSession[]>;
  /** Writes the new run's `queued` session. */
  startRuntimeSession(): Promise<AutomationStudioRuntimeSession>;
};

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
