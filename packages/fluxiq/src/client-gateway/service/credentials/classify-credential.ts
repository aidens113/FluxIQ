import type { ClientGatewayTrustedClient } from "@fluxiq/contracts/client-gateway";
import { clientGatewayCredentialHash } from "./digest.ts";
import { clientGatewayCredentialId, isSignedClientGatewayCredential } from "./signed-credential.ts";

/** A request already in flight is not evidence of reuse; a reconnect never receives this exception. */
const REQUEST_IN_FLIGHT_MS = 2 * 60_000;

export type ClientGatewayCredentialProof =
  | { status: "current" | "previous" }
  | { status: "obsolete"; reuse: "revoke" | "request-in-flight" }
  | { status: "invalid"; reason: "unknown" | "forged" };

/** Credential proof only: active trust, identity, tenant and session authorization belong to the caller. */
export function classifyClientGatewayCredential(client: ClientGatewayTrustedClient, token: string, now: number, options: { request?: boolean } = {}): ClientGatewayCredentialProof {
  const tokenHash = clientGatewayCredentialHash(token);
  if (client.tokenHash === tokenHash) return { status: "current" };
  if (client.previousTokenHash === tokenHash && (client.previousValidUntil ?? 0) > now) return { status: "previous" };
  if (!isSignedClientGatewayCredential(client, token)) {
    return { status: "invalid", reason: clientGatewayCredentialId(token) === client.trustedClientId ? "forged" : "unknown" };
  }
  const inFlight = options.request === true && now - (client.lastMovedOnAt ?? 0) < REQUEST_IN_FLIGHT_MS;
  return { status: "obsolete", reuse: inFlight ? "request-in-flight" : "revoke" };
}
