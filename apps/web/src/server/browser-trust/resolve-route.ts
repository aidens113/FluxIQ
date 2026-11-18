import type { ClientGatewayClientHello } from "fluxiq/client-gateway";
import type { ClientTrustBinding, ClientTrustRepository } from "fluxiq/platform";
import type { WorkspaceLease } from "../../lib/workspaces";

/** Proof selects a route; live authority must approve it before and after opening tenant storage. */
export async function resolveTrustedClientRoute(input: { hello: ClientGatewayClientHello; signal: AbortSignal }, deps: {
  repository: Pick<ClientTrustRepository, "lookupCredential">;
  primaryWorkspaceId: string;
  authorize(binding: ClientTrustBinding): Promise<boolean>;
  acquire(workspaceId: string): Promise<WorkspaceLease>;
}): Promise<{ gateway: WorkspaceLease["fluxiq"]["programs"]["clientGateway"]; release(): void } | null> {
  const { hello, signal } = input;
  if (signal.aborted || !hello.token || hello.enrolmentTicket) return null;
  const proof = await deps.repository.lookupCredential(hello.token);
  if (signal.aborted || proof.status === "invalid" || proof.status === "inactive") return null;
  const binding = proof.binding;
  if (binding.workspaceId === deps.primaryWorkspaceId || binding.clientId !== hello.clientId || binding.clientType !== hello.clientType) return null;
  if (binding.domainId === undefined || binding.domainId !== (hello.metadata?.domainId ?? null)) return null;
  if (!await deps.authorize(binding) || signal.aborted) return null;
  const lease = await deps.acquire(binding.workspaceId);
  let retained = false;
  try {
    if (signal.aborted || !await deps.authorize(binding) || signal.aborted) return null;
    // Includes signed obsolete proofs: the owning gateway must detect reuse and revoke trust.
    // The gateway still verifies the complete hello and current credential before any commands.
    const route = { gateway: lease.fluxiq.programs.clientGateway, release: () => lease.release() };
    retained = true;
    return route;
  } finally {
    if (!retained) lease.release();
  }
}
