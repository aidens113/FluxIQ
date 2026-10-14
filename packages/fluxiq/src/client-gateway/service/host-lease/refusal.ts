import type { ClientGatewayActionResult, CLIENT_GATEWAY_HOST_LEASE_REFUSAL_CODES } from "@fluxiq/contracts/client-gateway";

/** One of the failure codes for a command refused over its host lease. */
export type ClientGatewayHostLeaseRefusalCode = (typeof CLIENT_GATEWAY_HOST_LEASE_REFUSAL_CODES)[keyof typeof CLIENT_GATEWAY_HOST_LEASE_REFUSAL_CODES];

const REASONS: Readonly<Record<ClientGatewayHostLeaseRefusalCode, string>> = Object.freeze({
  "host_lease.stale": "The host lease this command was issued under was released or reissued, so it was not sent.",
  "host_lease.holder_mismatch": "This command carried a host lease its scope does not hold, so it was not sent.",
  "host_lease.missing": "A host resource is leased and this command carried no lease, so it was not sent."
});

/**
 * The result of a command refused over its host lease before it was sent: the
 * failure record the client uses for the same refusal (`failed`, category
 * `blocked_by_capability_or_policy`, not retryable, stage `dispatch`, effect
 * `unacted`), so whoever reads it treats both alike.
 */
export function clientGatewayHostLeaseRefusal(commandId: string, code: ClientGatewayHostLeaseRefusalCode): ClientGatewayActionResult {
  return {
    commandId,
    status: "failed",
    error: REASONS[code],
    failure: { category: "blocked_by_capability_or_policy", code, retryable: false, stage: "dispatch", effect: "unacted" }
  };
}
