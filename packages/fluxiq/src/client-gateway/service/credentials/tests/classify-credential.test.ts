import { describe, expect, it } from "vitest";
import type { ClientGatewayTrustedClient } from "@fluxiq/contracts/client-gateway";
import { classifyClientGatewayCredential, clientGatewayCredentialHash, issueClientGatewayCredential } from "../index.ts";

const now = 1_000_000;
const key = "synthetic-private-signing-key";
const id = "synthetic-trusted-client";
const current = issueClientGatewayCredential(id, key, "current-secret");
const previous = issueClientGatewayCredential(id, key, "previous-secret");
const obsolete = issueClientGatewayCredential(id, key, "obsolete-secret");

function client(overrides: Partial<ClientGatewayTrustedClient> = {}): ClientGatewayTrustedClient {
  return {
    trustedClientId: id,
    clientId: "extension.synthetic",
    clientType: "extension",
    name: "Synthetic browser",
    approvedByUserId: "user.synthetic",
    domainId: null,
    reuseKey: key,
    tokenHash: clientGatewayCredentialHash(current),
    previousTokenHash: clientGatewayCredentialHash(previous),
    previousValidUntil: now + 1_000,
    lastMovedOnAt: now,
    approvedAt: now,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: now,
    expiresAt: now + 60_000,
    ...overrides
  };
}

describe("shared gateway credential proof", () => {
  it("recognizes current and eligible previous credentials before any signature reuse decision", () => {
    expect(classifyClientGatewayCredential(client(), current, now)).toEqual({ status: "current" });
    expect(classifyClientGatewayCredential(client(), previous, now)).toEqual({ status: "previous" });
  });

  it("distinguishes an issued obsolete credential from a forged id claim", () => {
    expect(classifyClientGatewayCredential(client(), obsolete, now)).toEqual({ status: "obsolete", reuse: "revoke" });
    expect(classifyClientGatewayCredential(client(), `${id}.forged.secret`, now)).toEqual({ status: "invalid", reason: "forged" });
    expect(classifyClientGatewayCredential(client(), "unrelated-noise", now)).toEqual({ status: "invalid", reason: "unknown" });
    expect(classifyClientGatewayCredential(client(), `${obsolete}.extra`, now)).toEqual({ status: "invalid", reason: "unknown" });
  });

  it("preserves the request-in-flight exception and its boundary without excusing a hello", () => {
    expect(classifyClientGatewayCredential(client(), obsolete, now, { request: true })).toEqual({ status: "obsolete", reuse: "request-in-flight" });
    expect(classifyClientGatewayCredential(client(), obsolete, now + 120_000, { request: true })).toEqual({ status: "obsolete", reuse: "revoke" });
    expect(classifyClientGatewayCredential(client(), previous, now + 1_000)).toEqual({ status: "obsolete", reuse: "revoke" });
  });

  it("keeps old digest credentials current/previous and cannot invent signed reuse for them", () => {
    const legacy = client({ tokenHash: clientGatewayCredentialHash("legacy-current"), previousTokenHash: clientGatewayCredentialHash("legacy-previous") });
    delete legacy.reuseKey;
    expect(classifyClientGatewayCredential(legacy, "legacy-current", now)).toEqual({ status: "current" });
    expect(classifyClientGatewayCredential(legacy, "legacy-previous", now)).toEqual({ status: "previous" });
    expect(classifyClientGatewayCredential(legacy, "legacy-previous", now + 1_000)).toEqual({ status: "invalid", reason: "unknown" });
  });
});
