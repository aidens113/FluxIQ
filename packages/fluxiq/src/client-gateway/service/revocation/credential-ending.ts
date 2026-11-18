import type { ClientGatewayTrustedClient } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayRevocationReason } from "@fluxiq/contracts/platform";
import { classifyClientGatewayCredential, clientGatewayCredentialHash, clientGatewayCredentialId } from "../credentials/index.ts";

/** How the trust a refused credential proves ended. */
export type ClientGatewayCredentialEnding = Readonly<{ expired: boolean; revokedFor?: ClientGatewayRevocationReason }>;

/**
 * How the trust a credential proves ended: revoked (and what its holder is
 * told, when it is told anything) or expired. Undefined for a credential that
 * proves no trust, or one whose trust is still active. Proof is the same as a
 * forget's: the credential is signed by the trust it names, or its digest is
 * one the trust kept. Called only inside the registry mutation queue.
 */
export function clientGatewayCredentialEnding(
  clients: ReadonlyMap<string, ClientGatewayTrustedClient>,
  token: string,
  now: number,
  indexed: ClientGatewayTrustedClient | undefined
): ClientGatewayCredentialEnding | undefined {
  const namedId = clientGatewayCredentialId(token);
  const named = namedId ? clients.get(namedId) : undefined;
  const provedNamed = named && classifyClientGatewayCredential(named, token, now).status !== "invalid" ? named : undefined;
  const digest = clientGatewayCredentialHash(token);
  // Revocation and a restart both drop the token index; the digest a trust kept still proves it.
  const client = indexed ?? provedNamed ?? [...clients.values()].find((item) => item.tokenHash === digest || item.previousTokenHash === digest);
  if (!client) return undefined;
  if (client.revokedAt !== undefined) return client.revokedFor !== undefined ? { expired: false, revokedFor: client.revokedFor } : { expired: false };
  if (client.expiresAt <= now) return { expired: true };
  return undefined;
}
