import type { ClientGatewayTrustedClient } from "@fluxiq/contracts/client-gateway";

/** Reject corrupt authority instead of turning it into missing trust. Keeps legacy digest-only records intact. */
export function validateClientTrustRecord(value: unknown): asserts value is ClientGatewayTrustedClient {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("Invalid browser trust record.");
  const client = value as Record<string, unknown>;
  for (const field of ["trustedClientId", "clientId", "approvedByUserId"]) {
    if (typeof client[field] !== "string" || !client[field]) throw new TypeError(`Invalid browser trust ${field}.`);
  }
  if (typeof client.name !== "string" || typeof client.clientType !== "string" || !["extension", "desktop-recorder", "cli", "worker", "custom"].includes(client.clientType)) throw new TypeError("Invalid browser trust client metadata.");
  if (typeof client.tokenHash !== "string" || !/^[a-f0-9]{64}$/u.test(client.tokenHash)) throw new TypeError("Invalid browser trust digest.");
  if (client.previousTokenHash !== undefined && (typeof client.previousTokenHash !== "string" || !/^[a-f0-9]{64}$/u.test(client.previousTokenHash))) throw new TypeError("Invalid browser trust previous digest.");
  if (client.reuseKey !== undefined && (typeof client.reuseKey !== "string" || !client.reuseKey)) throw new TypeError("Invalid browser trust signing key.");
  if (client.domainId !== undefined && client.domainId !== null && typeof client.domainId !== "string") throw new TypeError("Invalid browser trust domain binding.");
  if (client.revocationReason !== undefined && typeof client.revocationReason !== "string") throw new TypeError("Invalid browser trust revocation reason.");
  for (const field of ["approvedAt", "createdAt", "updatedAt", "lastUsedAt", "expiresAt", "previousValidUntil", "lastMovedOnAt", "revokedAt"]) {
    const timestamp = client[field];
    const optional = ["previousValidUntil", "lastMovedOnAt", "revokedAt"].includes(field);
    if (optional && timestamp === undefined) continue;
    if (typeof timestamp !== "number" || !Number.isSafeInteger(timestamp) || timestamp < 0) throw new TypeError(`Invalid browser trust ${field}.`);
  }
  if (client.managedHost !== undefined) {
    const host = client.managedHost;
    if (typeof host !== "object" || host === null || !("hostId" in host) || typeof host.hostId !== "string" || !host.hostId || !("profile" in host) || (host.profile !== "fresh" && host.profile !== "named")) throw new TypeError("Invalid browser trust managed host binding.");
  }
}

/** Detaches incoming gateway memory, including the managed host binding, before asynchronous persistence. */
export function copyClientTrustRecord(client: ClientGatewayTrustedClient): ClientGatewayTrustedClient {
  const copy: unknown = JSON.parse(JSON.stringify(client));
  validateClientTrustRecord(copy);
  return copy;
}
