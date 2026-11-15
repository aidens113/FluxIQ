import type { ClientTrustBinding, ClientTrustRepository } from "fluxiq/platform";
import type { WorkspaceLease } from "../../lib/workspaces";

/** Resolves an HTTP credential to its immutable tenant, retaining gateway authentication as a separate step. */
export async function resolveTrustedClientHttpRoute(token: string, deps: {
  repository: Pick<ClientTrustRepository, "lookupCredential">;
  primaryWorkspaceId: string;
  authorize(binding: ClientTrustBinding): Promise<boolean>;
  acquire(workspaceId: string): Promise<WorkspaceLease>;
}): Promise<{ lease: WorkspaceLease; revalidateAuthority(): Promise<boolean> } | null> {
  const proof = await deps.repository.lookupCredential(token, { request: true });
  if (proof.status === "invalid" || proof.status === "inactive") return null;
  const binding = proof.binding;
  if (binding.managedHost || binding.workspaceId === deps.primaryWorkspaceId || !await deps.authorize(binding)) return null;
  const revalidateAuthority = async () => {
    const current = await deps.repository.lookupCredential(token, { request: true });
    if (current.status === "invalid" || current.status === "inactive" || !sameBinding(binding, current.binding)) return false;
    return deps.authorize(binding);
  };
  const lease = await deps.acquire(binding.workspaceId);
  let retained = false;
  try {
    if (lease.workspaceId !== binding.workspaceId || !await revalidateAuthority()) return null;
    retained = true;
    // Obsolete signed proofs still reach the owning gateway for reuse enforcement; this grants no command access.
    return { lease, revalidateAuthority };
  } finally {
    if (!retained) lease.release();
  }
}

function sameBinding(before: ClientTrustBinding, after: ClientTrustBinding): boolean {
  return !after.managedHost && before.workspaceId === after.workspaceId && before.trustedClientId === after.trustedClientId
    && before.approvedByUserId === after.approvedByUserId && before.clientId === after.clientId
    && before.clientType === after.clientType && before.domainId === after.domainId;
}
