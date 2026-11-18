import { environmentHostId } from "fluxiq/platform";
import type { EnvironmentDriverSpec, EnvironmentEnrolment, EnvironmentEnrolmentSession } from "fluxiq/platform";
import type { WorkspaceLease } from "../../lib/workspaces";
import { environmentLive } from "./environment-live";
import type { TenantEnrolmentOptions } from "./types";

/**
 * Enrolment at the tenant's own gateway. A start holds the environment's
 * workspace open, ends any trust its client held, and mints each ticket in
 * that workspace's gateway, bound to the workspace and environment, routing
 * it to that workspace alone. Every routed ticket keeps the workspace open
 * until its route ends, so the gateway that minted it is the one it reaches.
 * Revocation ends the routes and every trust the client holds.
 */
export function createTenantEnrolment(options: TenantEnrolmentOptions): EnvironmentEnrolment {
  return {
    open: async (spec) => openEnrolment(options, spec),
    revoke: async (spec, reason) => {
      options.routes.endForEnvironment(spec.environmentId);
      const lease = await held(options, spec);
      try {
        await lease.fluxiq.programs.clientGateway.managedHosts.revokeManagedHost(environmentHostId(spec.environmentId), reason);
      } finally {
        lease.release();
      }
    }
  };
}

async function openEnrolment(options: TenantEnrolmentOptions, spec: EnvironmentDriverSpec): Promise<EnvironmentEnrolmentSession> {
  const hostId = environmentHostId(spec.environmentId);
  const lease = await held(options, spec);
  const managedHosts = lease.fluxiq.programs.clientGateway.managedHosts;
  let opened = false;
  try {
    if (!await environmentLive(options.store, spec.workspaceId, spec.environmentId)) {
      throw new Error("environments.enrolment_not_running: only an environment recorded as running in this workspace enrols a client.");
    }
    options.routes.endForEnvironment(spec.environmentId);
    await managedHosts.revokeManagedHost(hostId, "The environment started again, so its client enrols afresh.");
    opened = true;
  } finally {
    if (!opened) lease.release();
  }
  // The start holds the workspace once, and every routed ticket once more until its route ends.
  let holds = 1;
  const drop = (): void => {
    holds -= 1;
    if (holds === 0) lease.release();
  };
  let open = true;
  return {
    takeEnrolmentTicket: () => {
      if (!open) throw new Error("environments.enrolment_closed: a ticket is minted only while its environment's start runs.");
      const minted = managedHosts.issueHostEnrolment({
        hostId,
        domainId: options.domainId,
        profile: "named",
        ...(options.ttlMs !== undefined ? { ttlMs: options.ttlMs } : {}),
        environment: { workspaceId: spec.workspaceId, environmentId: spec.environmentId }
      });
      holds += 1;
      let released = false;
      options.routes.register(minted.ticket, {
        workspaceId: spec.workspaceId,
        environmentId: spec.environmentId,
        release: () => {
          if (released) return;
          released = true;
          drop();
        }
      }, minted.expiresAt);
      return minted.ticket;
    },
    close: () => {
      if (!open) return;
      open = false;
      drop();
    }
  };
}

/** The environment's own workspace, held; anything else is refused and released. */
async function held(options: TenantEnrolmentOptions, spec: EnvironmentDriverSpec): Promise<WorkspaceLease> {
  const lease = await options.acquire(spec.workspaceId);
  if (lease.workspaceId === spec.workspaceId) return lease;
  lease.release();
  throw new Error("environments.enrolment_workspace_mismatch: the held workspace is not the environment's.");
}
