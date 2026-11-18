import type { ClientGatewayHostLease } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayHostLeaseTarget } from "./target.ts";

/** Instance authority is captured by this trusted source, never supplied by a command. */
export type ClientGatewayHostLeaseTargetSource = {
  readonly kind: "owner-domain.v1";
  current(target: ClientGatewayHostLeaseTarget): ClientGatewayHostLease | undefined;
  isCurrent(lease: ClientGatewayHostLease, target: ClientGatewayHostLeaseTarget): boolean;
  requiresLease(target: ClientGatewayHostLeaseTarget): boolean;
};
