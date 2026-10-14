import type { ClientGatewayHostLease } from "@fluxiq/contracts/client-gateway";

/**
 * Where the gateway reads the host lease an action command is issued under
 * (automation-project-agents-plan, `Host resources and concurrency`), the way
 * it reads `commandOwner`: from the async context the command is dispatched
 * in. The host wires Core's lease scope here
 * (`programs/automation-studio/runtime/project-agents/host-resources/lease-scope.ts`);
 * the gateway never imports it.
 */
export type ClientGatewayHostLeaseSource = {
  /** The lease the dispatching async context runs under, or nothing outside any lease scope. */
  current(): ClientGatewayHostLease | undefined;
  /** Whether `lease` is still the one its resource is held under: false once it was released or the resource reissued. */
  isCurrent(lease: ClientGatewayHostLease): boolean;
  /**
   * Strict mode: true while a host resource on gateway session `sessionId` --
   * the session the command is addressed to -- is leased under a scope that
   * demands leases. A command to that session with no lease is then refused
   * (`host_lease.missing`), so nothing outside a holder's scope acts on a
   * resource someone holds; commands to other sessions are not affected. A
   * lease whose resource names no session counts for every session.
   */
  requiresLease(sessionId: string): boolean;
};
