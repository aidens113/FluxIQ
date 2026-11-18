import type { ClientGatewayHostLeaseSource } from "./source.ts";
import type { ClientGatewayHostLeaseTarget } from "./target.ts";
import type { ClientGatewayHostLeaseTargetSource } from "./target-source.ts";

/** Retains the public legacy string callback exactly; only tagged sources receive targets. */
export function clientGatewayHostLeaseForTarget(source: ClientGatewayHostLeaseSource | ClientGatewayHostLeaseTargetSource | undefined, target: ClientGatewayHostLeaseTarget): ClientGatewayHostLeaseSource | undefined {
  if (!source) return undefined;
  if (!("kind" in source) || source.kind === undefined) return source as ClientGatewayHostLeaseSource;
  if (source.kind !== "owner-domain.v1") throw new Error("client_gateway.host_lease_source_unsupported");
  return {
    current: () => source.current(target),
    isCurrent: (lease) => source.isCurrent(lease, target),
    requiresLease: (sessionId) => sessionId === target.sessionId && source.requiresLease(target)
  };
}
