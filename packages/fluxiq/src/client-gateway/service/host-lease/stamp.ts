import { CLIENT_GATEWAY_HOST_LEASE_REFUSAL_CODES, type ClientGatewayActionCommand, type ClientGatewayHostLease } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayHostLeaseRefusalCode } from "./refusal.ts";
import type { ClientGatewayHostLeaseSource } from "./source.ts";

/** A command to send -- the caller's own object when no lease is in force, else a copy carrying the scope's lease -- or why it may not be sent. */
export type ClientGatewayHostLeaseStamp =
  | { readonly command: ClientGatewayActionCommand; readonly refused?: never }
  | { readonly refused: ClientGatewayHostLeaseRefusalCode; readonly command?: never };

/**
 * Stamps the lease of the dispatching scope on an action command, as
 * `commandOwner` is read, before anything is sent or claimed:
 *
 * - a lease the caller wrote that is not the scope's own is refused
 *   (`host_lease.holder_mismatch`): a caller never writes it;
 * - the scope's lease, once released or reissued, is refused (`host_lease.stale`);
 * - with no lease in scope while a strict scope holds a resource on the
 *   session the command is addressed to, the command is refused
 *   (`host_lease.missing`);
 * - with no lease in scope otherwise, the caller's command is returned as it
 *   came, so its payload is what it was before leases existed.
 */
export function clientGatewayHostLeaseStamp(command: ClientGatewayActionCommand, source: ClientGatewayHostLeaseSource | undefined, sessionId: string): ClientGatewayHostLeaseStamp {
  const supplied = command.lease;
  const scoped = source?.current();
  if (supplied !== undefined && (!scoped || !sameLease(supplied, scoped))) return { refused: CLIENT_GATEWAY_HOST_LEASE_REFUSAL_CODES.holderMismatch };
  if (scoped) {
    if (!source!.isCurrent(scoped)) return { refused: CLIENT_GATEWAY_HOST_LEASE_REFUSAL_CODES.stale };
    return { command: { ...command, lease: wireLease(scoped) } };
  }
  if (source?.requiresLease(sessionId)) return { refused: CLIENT_GATEWAY_HOST_LEASE_REFUSAL_CODES.missing };
  return { command };
}

function sameLease(left: ClientGatewayHostLease, right: ClientGatewayHostLease): boolean {
  return left?.resourceKey === right.resourceKey
    && left.epoch === right.epoch
    && left.holder?.role === right.holder.role
    && left.holder.briefId === right.holder.briefId;
}

/** Only the lease's own fields, so nothing else the scope's object holds reaches the wire. */
function wireLease(lease: ClientGatewayHostLease): ClientGatewayHostLease {
  return { resourceKey: lease.resourceKey, epoch: lease.epoch, holder: { role: lease.holder.role, briefId: lease.holder.briefId } };
}
