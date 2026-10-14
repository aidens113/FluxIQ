// Admitting a project build's partial trial (`metadata.subflowTrial`; unit
// A4b). Not an adaptive run, so the one-adaptive-run-per-project rule
// (`./admission.ts`) does not hold it; what holds it is the build and the host
// resource. A partial trial is admitted only for a build this service is
// running and only while its brief holds a current host-resource lease
// (`../../project-agents/host-resources/`): a released or reissued lease is
// refused here, so a stale builder's late trial never opens a session. As
// many trials run at once as the domain's capacity grants leases; nothing here
// counts them.

import type { AutomationStudioRuntimeSession } from "../../../model/index.ts";
import type { AutomationStudioHostResourceLease, AutomationStudioHostResourceScheduler } from "../../project-agents/host-resources/index.ts";

/** What admitting a build's trial reaches the service for. */
export type AutomationStudioBuildTrialAdmissionPorts = {
  /** Whether `buildId` names a project build this service is running now. */
  knownBuild(buildId: string): boolean | Promise<boolean>;
  /** The build's host-resource scheduler; only its lease check is asked. */
  leases: Pick<AutomationStudioHostResourceScheduler, "assertCurrent">;
  /** Writes the trial's `queued` session. */
  startRuntimeSession(): Promise<AutomationStudioRuntimeSession>;
};

/** The trial asking: its build, its brief, and the lease that brief holds. */
export type AutomationStudioBuildTrialAdmissionRequest = {
  buildId: string;
  briefId: string;
  lease: AutomationStudioHostResourceLease | undefined;
};

/**
 * Starts a build trial's session, or throws why it may not run: no lease, a
 * lease another brief holds, an unknown build, or a lease no longer current
 * (`AutomationStudioHostResourceStaleLeaseError`). The lease is checked after
 * the build is, so a lease released while the build was looked up is refused.
 */
export async function admitAutomationStudioBuildTrialSession(ports: AutomationStudioBuildTrialAdmissionPorts, request: AutomationStudioBuildTrialAdmissionRequest): Promise<AutomationStudioRuntimeSession> {
  const { buildId, briefId, lease } = request;
  if (!buildId || !briefId) throw new Error("A build trial needs its build and brief.");
  if (!lease) throw new Error(`Brief ${briefId} holds no host resource lease, so its trial cannot run.`);
  if (lease.holder.briefId !== briefId) throw new Error(`The host resource lease offered for brief ${briefId} is held by brief ${lease.holder.briefId}.`);
  if (!await ports.knownBuild(buildId)) throw new Error(`Build ${buildId} is not running, so its trial cannot run.`);
  ports.leases.assertCurrent(lease);
  return await ports.startRuntimeSession();
}
