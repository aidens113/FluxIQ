import type { ClientTrustBinding, PlatformServicesOptions } from "fluxiq/platform";

type RevokeConnectedClients = NonNullable<PlatformServicesOptions["revokeConnectedClients"]>;
type RevocationReason = Parameters<RevokeConnectedClients>[1];

/** What revoking needs of one workspace's client gateway. */
type RevokingGateway = {
  ready(): Promise<void>;
  revokeTrustedClient(trustedClientId: string, reason?: string, revokedFor?: RevocationReason | null): Promise<boolean>;
  snapshot(): { trustedClients: ReadonlyArray<{ trustedClientId: string; approvedByUserId: string; status: string; managedHost?: unknown }> };
};

/** A tenant workspace held for one revocation; null when it no longer exists. */
type HeldGateway = { gateway: RevokingGateway; release(): void };

/**
 * Where a person's paired clients live, by tenancy:
 *
 * - `single`: in the one workspace's own gateway store, read from its
 *   snapshot;
 * - `multi`: in the platform's browser-trust authority (`listActiveForUser`),
 *   each bound to one workspace; the primary workspace's are revoked through
 *   the primary's gateway, a tenant's through that tenant's gateway, held with
 *   `holdWorkspace` (which never creates a missing root).
 */
export type ConnectedClientRevokerDeps = {
  tenancy: "single" | "multi";
  primaryWorkspaceId: string;
  primaryGateway(): RevokingGateway;
  listActiveForUser(userId: string): Promise<ClientTrustBinding[]>;
  holdWorkspace(workspaceId: string): Promise<HeldGateway | null>;
};

/**
 * Provisioning's `revokeConnectedClients` port: revokes each of a person's
 * current paired browsers (managed hosts are the environments' own), in every
 * workspace or, with a scope, only in that one, through the gateway that
 * owns it, so the browser is told the reason (`server.revoked`) and its
 * sockets close. Answers how many it revoked now.
 */
export function createConnectedClientRevoker(deps: ConnectedClientRevokerDeps): RevokeConnectedClients {
  return async (userId, reason, scope) => {
    if (deps.tenancy === "single") {
      if (scope !== undefined && scope.workspaceId !== deps.primaryWorkspaceId) return 0;
      const gateway = deps.primaryGateway();
      await gateway.ready();
      const owned = gateway.snapshot().trustedClients.filter((client) => client.approvedByUserId === userId && client.status === "active" && !client.managedHost);
      return revokeEach(gateway, owned.map((client) => client.trustedClientId), reason);
    }
    const bindings = (await deps.listActiveForUser(userId)).filter((binding) => binding.approvedByUserId === userId && !binding.managedHost && (scope === undefined || binding.workspaceId === scope.workspaceId));
    const byWorkspace = new Map<string, string[]>();
    for (const binding of bindings) byWorkspace.set(binding.workspaceId, [...(byWorkspace.get(binding.workspaceId) ?? []), binding.trustedClientId]);
    let revoked = 0;
    for (const [workspaceId, trustedClientIds] of byWorkspace) {
      if (workspaceId === deps.primaryWorkspaceId) {
        const gateway = deps.primaryGateway();
        await gateway.ready();
        revoked += await revokeEach(gateway, trustedClientIds, reason);
        continue;
      }
      const held = await deps.holdWorkspace(workspaceId);
      // A workspace already gone serves no credential: its clients cannot reach anything.
      if (held === null) continue;
      try {
        revoked += await revokeEach(held.gateway, trustedClientIds, reason);
      } finally {
        held.release();
      }
    }
    return revoked;
  };
}

async function revokeEach(gateway: RevokingGateway, trustedClientIds: readonly string[], reason: RevocationReason): Promise<number> {
  let revoked = 0;
  for (const trustedClientId of trustedClientIds) {
    if (await gateway.revokeTrustedClient(trustedClientId, reason, reason)) revoked += 1;
  }
  return revoked;
}
