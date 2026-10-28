// The connected-client credential record: `approvingSessionId` holds a digest
// and never a raw session id, paired fields go together, and the list view
// drops every hash and the session digest.
import { describe, expect, it } from "vitest";
import {
  connectedClientRecordSchema,
  connectedClientStatus,
  connectedClientView,
  formatConnectReferenceCode,
  isConnectReferenceCode,
  normalizeConnectReferenceCode,
  type ConnectedClientRecord
} from "../index.ts";

const DIGEST = "a".repeat(64);

const RECORD: ConnectedClientRecord = {
  connectedClientId: "cc-1",
  userId: "u1",
  workspaceId: "ws-1",
  clientId: "client.7",
  clientInstallId: "6b0f2c8e-1d4a-4c6b-9f3e-2a7d5b8c0e1f",
  domainId: "web",
  label: "Work laptop",
  runtime: "Chrome 156",
  os: "Windows 11",
  createdAt: 1_000,
  lastSeenAt: 2_000,
  lastIpPrefix: "203.0.113.0/24",
  credentialHash: "b".repeat(64),
  previousCredentialHash: "c".repeat(64),
  previousValidUntil: 2_120,
  expiresAt: 10_000,
  revokedAt: null,
  revocationReason: null,
  approvingSessionId: DIGEST
};

describe("connected-client record", () => {
  it("accepts a full record and a migrated trusted client", () => {
    expect(connectedClientRecordSchema.parse(RECORD)).toEqual(RECORD);
    const migrated = { ...RECORD, clientInstallId: null, approvingSessionId: null, previousCredentialHash: null, previousValidUntil: null, runtime: null, os: null, lastIpPrefix: null };
    expect(connectedClientRecordSchema.parse(migrated)).toEqual(migrated);
  });

  it("refuses a raw session id where the digest belongs", () => {
    expect(connectedClientRecordSchema.safeParse({ ...RECORD, approvingSessionId: "0b5e7c1a-3f9d-4a55-8e2c-9d1f00aa11bb" }).success).toBe(false);
    expect(connectedClientRecordSchema.safeParse({ ...RECORD, approvingSessionId: DIGEST.toUpperCase() }).success).toBe(false);
  });

  it("keeps paired fields together and refuses unknown ones", () => {
    expect(connectedClientRecordSchema.safeParse({ ...RECORD, previousValidUntil: null }).success).toBe(false);
    expect(connectedClientRecordSchema.safeParse({ ...RECORD, revokedAt: 3_000 }).success).toBe(false);
    expect(connectedClientRecordSchema.safeParse({ ...RECORD, revokedAt: 3_000, revocationReason: "revoked_by_user" }).success).toBe(true);
    expect(connectedClientRecordSchema.safeParse({ ...RECORD, revokedAt: 3_000, revocationReason: "because" }).success).toBe(false);
    expect(connectedClientRecordSchema.safeParse({ ...RECORD, token: "x" }).success).toBe(false);
  });

  it("reports status with revocation winning over expiry", () => {
    expect(connectedClientStatus(RECORD, 5_000)).toBe("active");
    expect(connectedClientStatus(RECORD, 10_000)).toBe("expired");
    expect(connectedClientStatus({ revokedAt: 3_000, expiresAt: 10_000 }, 5_000)).toBe("revoked");
  });

  it("shows no hash and no session digest in the list view", () => {
    const view = connectedClientView(RECORD, 5_000);
    expect(view.status).toBe("active");
    for (const hidden of ["credentialHash", "previousCredentialHash", "previousValidUntil", "approvingSessionId"]) expect(Object.hasOwn(view, hidden)).toBe(false);
    expect(view.label).toBe("Work laptop");
  });
});

describe("typed reference codes", () => {
  it("normalises what a person types and refuses ambiguous characters", () => {
    expect(normalizeConnectReferenceCode("abcd-efgh")).toBe("ABCDEFGH");
    expect(normalizeConnectReferenceCode(" 2345 6789 ")).toBe("23456789");
    for (const typed of ["ABCD-EFG", "ABCD-EFGHJ", "ABCD-EFG0", "ABCD-EFGI", "ABCD-EFGL", "ABCD-EFGO", "ABCD-EFG1"]) expect(normalizeConnectReferenceCode(typed)).toBeNull();
  });

  it("formats a canonical code in two groups", () => {
    expect(isConnectReferenceCode("ABCDEFGH")).toBe(true);
    expect(formatConnectReferenceCode("ABCDEFGH")).toBe("ABCD-EFGH");
    expect(() => formatConnectReferenceCode("abcdefgh")).toThrow(TypeError);
  });
});
