// The `client.action_result` a command refused for its host lease is answered
// with. The refusal is a failure that did nothing (`effect: "unacted"`), never
// retryable as sent: the same command under the same lease would be refused
// again, so the holder must be told rather than retried. It names the resource
// epochs, which are Core's own bookkeeping, and nothing about the client's
// surroundings.

import type { ClientGatewayActionResult } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayHostLeaseRefusalCode } from "./types.ts";

export function clientGatewayHostLeaseRefusal(
  commandId: string,
  code: ClientGatewayHostLeaseRefusalCode,
  at: number,
  seenEpoch?: number
): ClientGatewayActionResult {
  const message = REFUSAL_MESSAGES[code];
  const actual = seenEpoch === undefined ? message : `${message} The client has seen epoch ${seenEpoch} for this resource.`;
  return {
    commandId,
    status: "failed",
    startedAt: at,
    completedAt: at,
    message,
    error: message,
    failure: {
      category: "blocked_by_capability_or_policy",
      code,
      retryable: false,
      stage: "dispatch",
      expected: "a command issued under the current host lease",
      actual,
      effect: "unacted"
    },
    payload: { commandId, status: "refused", code }
  };
}

const REFUSAL_MESSAGES: Readonly<Record<ClientGatewayHostLeaseRefusalCode, string>> = Object.freeze({
  "host_lease.stale": "The command was issued under a host lease that has since been granted again, so the client did not act on it.",
  "host_lease.holder_mismatch": "The command's host lease names another holder than the one the client has for that grant, so the client did not act on it.",
  "host_lease.missing": "The command's host lease could not be read, so the client did not act on it."
});
