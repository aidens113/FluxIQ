import { CLIENT_GATEWAY_PROTOCOL_VERSION } from "@fluxiq/contracts/client-gateway";

/**
 * What the gateway makes of the protocol version a client's hello arrived
 * under (C10 of the state-aware recovery plan).
 *
 * - `accepted`: the same major version as `CLIENT_GATEWAY_PROTOCOL_VERSION`. A
 *   minor difference is compatible by definition and is accepted silently.
 * - `missing`: the envelope carried no version. Accepted, because a client
 *   built before the field was checked may send none; the caller records a
 *   warning so the gap is visible.
 * - `refused`: another major version. The two sides do not speak the same
 *   protocol, and the session must not go on to pair; `reason` says so plainly.
 */
export type ClientGatewayProtocolVersionVerdict =
  | { kind: "accepted"; version: string }
  | { kind: "missing" }
  | { kind: "refused"; version: string; reason: string };

/** Compares a hello envelope's `protocolVersion` to this gateway's by major version. */
export function clientGatewayProtocolVersionVerdict(version: unknown, expected: string = CLIENT_GATEWAY_PROTOCOL_VERSION): ClientGatewayProtocolVersionVerdict {
  if (typeof version !== "string" || !version.trim()) return { kind: "missing" };
  const offered = version.trim();
  if (majorOf(offered) === majorOf(expected)) return { kind: "accepted", version: offered };
  return {
    kind: "refused",
    version: offered,
    reason: `This client speaks FluxIQ connection protocol ${offered}, but FluxIQ speaks ${expected}. Update ${majorOf(offered) > majorOf(expected) ? "FluxIQ" : "the client"} so both use the same version.`
  };
}

function majorOf(version: string): number {
  const major = Number.parseInt(version.split(".")[0] ?? "", 10);
  return Number.isFinite(major) ? major : Number.NaN;
}
