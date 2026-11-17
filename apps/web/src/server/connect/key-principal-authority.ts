import { workspaceAccountEligible } from "../account-access";
import type { FluxIQOptions } from "fluxiq";
import { pairedClientActor } from "fluxiq/server";
import { getBrowserTrustRepository } from "../browser-trust";

/** Re-resolve primary identity and tenant membership for each saved-key use. */
export function workspaceKeyPrincipalAuthority(workspaceId: string): NonNullable<FluxIQOptions["secretKeyPrincipalAuthority"]> {
  return async (principal) => {
    if (principal.kind === "standing") return null;
    const { getFluxIQAfterReload, getFluxIQWorkspaces } = await import("../../lib/fluxiq");
    const { getPlatformServices } = await import("../provisioning-listener");
    const primary = await getFluxIQAfterReload();
    const manager = getFluxIQWorkspaces();
    const identity = primary.programs.identityAccess;
    const directory = await identity.snapshot();
    if (!await workspaceAccountEligible({ userId: principal.userId, workspaceId, tenancy: manager.tenancy, primaryWorkspaceId: manager.primaryWorkspaceId, store: (await getPlatformServices()).store, enabledUser: async (id) => directory.users.some((user) => user.id === id && user.enabled) })) return null;
    if (principal.kind === "session") {
      const auth = await identity.validateSession(principal.sessionId);
      if (!auth || auth.user.id !== principal.userId) return null;
      return { actor: { userId: auth.user.id, sessionId: principal.sessionId, roleId: auth.role.id, permissions: auth.role.permissions, channel: "panel" }, expiresAtMs: auth.session.expiresAtMs };
    }
    const clients = await getBrowserTrustRepository(primary.paths.fluxiq).scopedStore(workspaceId).load();
    const client = clients.find((item) => item.trustedClientId === principal.trustedClientId && item.approvedByUserId === principal.userId && !item.managedHost && item.revokedAt === undefined && item.expiresAt > Date.now());
    if (!client) return null;
    const actor = pairedClientActor<"programs.read" | "programs.write" | "runtime.control" | "flows.write">({ sessionId: `use:${client.trustedClientId}`, operatorUserId: principal.userId }, directory);
    return actor ? { actor, expiresAtMs: client.expiresAt } : null;
  };
}
