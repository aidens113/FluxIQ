import type { ClientGatewaySession } from "@fluxiq/contracts/client-gateway";
import type { AutomationStudioHostResourceGrant, AutomationStudioHostResourcePort } from "../../../../../runtime/automation-host/index.ts";

/** Each managed browser is a distinct resource with independent profile state. */
export function createFluxNodeManagedHostPort(options: { sessions(): readonly ClientGatewaySession[]; domainId: string; capacity: number; now?: () => number }): AutomationStudioHostResourcePort {
  const held = new Map<string, AutomationStudioHostResourceGrant>();
  const epochs = new Map<string, number>();
  return {
    capacity: options.capacity,
    acquire: () => {
      const session = options.sessions().find((candidate) => candidate.managedHostId !== undefined && candidate.status === "ready" && candidate.disconnectedAt === undefined
        && candidate.activeRecordingId === undefined && candidate.metadata?.domainId === options.domainId && !held.has(candidate.managedHostId));
      if (!session?.managedHostId) return "at_capacity";
      const epoch = Math.max((epochs.get(session.managedHostId) ?? 0) + 1, Math.floor((options.now ?? Date.now)()));
      epochs.set(session.managedHostId, epoch);
      const grant = Object.freeze({ resourceKey: `fluxnode.host:${session.managedHostId}`, epoch, sessionId: session.sessionId });
      held.set(session.managedHostId, grant);
      return grant;
    },
    release: (lease) => {
      for (const [hostId, grant] of held) if (grant.resourceKey === lease.resourceKey && grant.epoch === lease.epoch) held.delete(hostId);
    }
  };
}
