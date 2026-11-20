
/** Migrate password-only legacy seals during ordinary login, in the user's actual tenant. */
export async function restoreLoginKeys(input: { sessionId: string; userId: string; authorizationPassword: string; expiresAtMs: number }): Promise<void> {
  const { getFluxIQWorkspaces } = await import("../../lib/fluxiq");
  const { platformScope } = await import("../../lib/platform");
  const manager = getFluxIQWorkspaces();
  if (manager.tenancy === "single") {
    await manager.primary().fluxiq.programs.secretKeys.unlockSession({ ...input, passwordVerified: true });
    return;
  }
  const { getPlatformServices } = await import("../provisioning-listener");
  const { sessionWorkspaceId } = await import("../../lib/workspaces");
  const workspaceId = await sessionWorkspaceId({ sessionId: input.sessionId, manager, platformServices: getPlatformServices });
  if (!workspaceId) return; // A newly authenticated account may not have a workspace yet.
  const lease = await manager.acquire(workspaceId);
  try {
    const auth = await platformScope().identityAccess.validateSession(input.sessionId);
    if (!auth || auth.user.id !== input.userId || lease.workspaceId !== workspaceId || await sessionWorkspaceId({ sessionId: input.sessionId, manager, platformServices: getPlatformServices }) !== workspaceId) throw new Error("Login key recovery authority changed.");
    await lease.fluxiq.programs.secretKeys.unlockSession({ ...input, passwordVerified: true });
  } finally { lease.release(); }
}
