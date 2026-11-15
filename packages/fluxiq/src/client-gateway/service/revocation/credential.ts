import type { ClientGatewayTrustedClient } from "@fluxiq/contracts/client-gateway";
import { classifyClientGatewayCredential, clientGatewayCredentialHash, clientGatewayCredentialId } from "../credentials/index.ts";

/** Called only inside the registry mutation queue; proof reduces this matching trust, never content authority. */
export function resolveClientGatewayForgetCredential(
  clients: ReadonlyMap<string, ClientGatewayTrustedClient>,
  token: string,
  now: number,
  indexed: ClientGatewayTrustedClient | undefined
): Readonly<{ trustedClientId: string; clientId: string; status: "current" | "previous" | "obsolete" | "revoked" }> | undefined {
  const namedId = clientGatewayCredentialId(token);
  const named = namedId ? clients.get(namedId) : undefined;
  const provedNamed = named && classifyClientGatewayCredential(named, token, now).status !== "invalid" ? named : undefined;
  const digest = clientGatewayCredentialHash(token);
  // Revocation removes the token index. A legacy digest can still prove which already-revoked trust needs cleanup.
  const client = indexed ?? provedNamed ?? [...clients.values()].find((item) => item.revokedAt !== undefined && (item.tokenHash === digest || item.previousTokenHash === digest));
  if (!client || clients.get(client.trustedClientId) !== client) return undefined;
  const proof = classifyClientGatewayCredential(client, token, now);
  if (proof.status === "invalid") return undefined;
  if (client.revokedAt !== undefined) return { trustedClientId: client.trustedClientId, clientId: client.clientId, status: "revoked" };
  if (client.expiresAt <= now) return undefined;
  return { trustedClientId: client.trustedClientId, clientId: client.clientId, status: proof.status };
}
