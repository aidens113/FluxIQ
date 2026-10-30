import type { ClientGatewayAuditEntry } from "@fluxiq/contracts/client-gateway";
import { describe, expect, it } from "vitest";
import { CLIENT_GATEWAY_DEFAULT_AUDIT_LIMIT, ClientGatewayAuditLog } from "../audit-log.ts";

// t802 W2b: the audit is a bounded ring, and security events reach listeners
// as they are recorded so the web layer can keep what the ring overwrites.
describe("ClientGatewayAuditLog ring", () => {
  it("keeps the newest `limit` entries in order, overwriting the oldest", () => {
    const audit = new ClientGatewayAuditLog(() => 1, 3);
    for (let index = 0; index < 7; index += 1) audit.record("test.entry", `entry ${index}`);

    expect(audit.size()).toBe(3);
    expect(audit.recent(10).map((entry) => entry.message)).toEqual(["entry 4", "entry 5", "entry 6"]);
    expect(audit.recent(2).map((entry) => entry.message)).toEqual(["entry 5", "entry 6"]);
    expect(audit.recent(0)).toEqual([]);
  });

  it("reads in order before the ring has filled", () => {
    const audit = new ClientGatewayAuditLog(() => 1, 5);
    for (let index = 0; index < 3; index += 1) audit.record("test.entry", `entry ${index}`);
    expect(audit.recent(100).map((entry) => entry.message)).toEqual(["entry 0", "entry 1", "entry 2"]);
  });

  it("holds 10,000 entries by default", () => {
    const audit = new ClientGatewayAuditLog(() => 1);
    for (let index = 0; index < CLIENT_GATEWAY_DEFAULT_AUDIT_LIMIT + 250; index += 1) audit.record("test.entry", `entry ${index}`);
    expect(audit.size()).toBe(10_000);
    expect(audit.recent(1)[0]?.message).toBe(`entry ${CLIENT_GATEWAY_DEFAULT_AUDIT_LIMIT + 249}`);
    expect(audit.recent(10_000)[0]?.message).toBe("entry 250");
  });

  it("refuses an invalid limit", () => {
    expect(() => new ClientGatewayAuditLog(() => 1, 0)).toThrow(/audit_limit_invalid/);
  });
});

describe("ClientGatewayAuditLog security listeners", () => {
  it("delivers security events only, and stops after unsubscribe", () => {
    const audit = new ClientGatewayAuditLog(() => 1);
    const heard: ClientGatewayAuditEntry[] = [];
    const unsubscribe = audit.onSecurityEvent((entry) => {
      heard.push(entry);
    });

    audit.record("session.connected", "not a security event", { sessionId: "s1" });
    audit.record("trust.revoked", "revoked", { trustedClientId: "t1" });
    audit.recordSecurity("transport.origin_refused", "origin refused", { origin: "https://example.test" });
    unsubscribe();
    audit.record("pairing.refused_capacity", "after unsubscribe");

    expect(heard.map((entry) => entry.type)).toEqual(["trust.revoked", "transport.origin_refused"]);
    expect(heard[1]).toMatchObject({ message: "origin refused", metadata: { origin: "https://example.test" } });
    expect(audit.recent(10).map((entry) => entry.type)).toEqual(["session.connected", "trust.revoked", "transport.origin_refused", "pairing.refused_capacity"]);
  });

  it("audits a listener that throws or rejects, and keeps delivering to the others", async () => {
    const audit = new ClientGatewayAuditLog(() => 1);
    const heard: string[] = [];
    audit.onSecurityEvent(() => {
      throw new Error("store offline");
    });
    audit.onSecurityEvent(async () => {
      throw new Error("store rejected");
    });
    audit.onSecurityEvent((entry) => {
      heard.push(entry.type);
    });

    expect(() => audit.record("trust.revoked", "revoked")).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();

    expect(heard).toEqual(["trust.revoked"]);
    const failures = audit.recent(10).filter((entry) => entry.type === "audit.security_listener_failed");
    expect(failures.map((entry) => entry.metadata?.error).sort()).toEqual(["store offline", "store rejected"]);
  });
});
