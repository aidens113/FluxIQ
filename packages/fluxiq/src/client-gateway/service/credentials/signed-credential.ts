import { createHmac, timingSafeEqual } from "node:crypto";
import type { ClientGatewayTrustedClient } from "@fluxiq/contracts/client-gateway";

const CREDENTIAL_SIGNATURE_BYTES = 16;

/** Preserves the gateway's signed credential wire format and per-client reuse key. */
export function issueClientGatewayCredential(trustedClientId: string, reuseKey: string, secret: string): string {
  return `${trustedClientId}.${secret}.${credentialSignature(trustedClientId, reuseKey, secret)}`;
}

/** An id is only a lookup hint until the existing signature or stored digest proves it. */
export function clientGatewayCredentialId(token: string): string | undefined {
  const parts = token.split(".");
  return parts.length === 3 && parts[0] ? parts[0] : undefined;
}

/** Whether Core issued this credential to this client, including an obsolete credential. */
export function isSignedClientGatewayCredential(client: ClientGatewayTrustedClient, token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== client.trustedClientId || !client.reuseKey) return false;
  const expected = Buffer.from(credentialSignature(client.trustedClientId, client.reuseKey, parts[1] ?? ""), "utf8");
  const given = Buffer.from(parts[2] ?? "", "utf8");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

function credentialSignature(trustedClientId: string, reuseKey: string, secret: string): string {
  return createHmac("sha256", reuseKey).update(`${trustedClientId}.${secret}`, "utf8").digest().subarray(0, CREDENTIAL_SIGNATURE_BYTES).toString("base64url");
}
