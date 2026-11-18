import type { ClientGatewayClientHello } from "fluxiq/client-gateway";
import type { ClientTrustBinding, ClientTrustRepository } from "fluxiq/platform";
import type { WorkspaceLease } from "../../lib/workspaces";

type Route = { gateway: WorkspaceLease["fluxiq"]["programs"]["clientGateway"]; release(): void };

/**
 * Proof selects a route; live authority must approve it before and after
 * opening tenant storage. A hello presenting an enrolment ticket routes by
 * the ticket alone (`enrolment`), whatever token it also carries, and without
 * an enrolment route it routes nowhere.
 */
export async function resolveTrustedClientRoute(input: { hello: ClientGatewayClientHello; signal: AbortSignal }, deps: {
  repository: Pick<ClientTrustRepository, "lookupCredential">;
  primaryWorkspaceId: string;
  authorize(binding: ClientTrustBinding): Promise<boolean>;
  acquire(workspaceId: string): Promise<WorkspaceLease>;
  enrolment?(input: { ticket: string; signal: AbortSignal }): Promise<Route | null>;
}): Promise<Route | null> {
  const { hello, signal } = input;
  if (signal.aborted) return null;
  if (hello.enrolmentTicket !== undefined) return deps.enrolment && hello.enrolmentTicket ? deps.enrolment({ ticket: hello.enrolmentTicket, signal }) : null;
  if (!hello.token) return null;
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
