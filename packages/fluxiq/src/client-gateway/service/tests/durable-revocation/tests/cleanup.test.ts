import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClientGatewayCredentialCustody } from "../../../credential-custody.ts";
import { revocationFixture } from "../fixture.ts";

afterEach(() => vi.restoreAllMocks());

function custody(forgotten: ClientGatewayCredentialCustody["forgotten"]): ClientGatewayCredentialCustody {
  return {
    issued: async () => undefined,
    confirmed: async () => undefined,
    rotating: async () => undefined,
    presented: async () => undefined,
    released: () => undefined,
    forgotten
  };
}

describe("cleanup after durable revocation", () => {
  it.each(["operator", "credential"] as const)("retries a failed send for a repeated %s teardown", async (kind) => {
    let failDisconnect = false;
    const forgotten = vi.fn(async () => undefined);
    const socket = {
      send: async (text: string) => {
        // An operator's revoke tells the client (`server.revoked`); a forget the client asked for only disconnects it.
        if (failDisconnect && ["server.disconnect", "server.revoked"].includes(JSON.parse(text).type)) {
          failDisconnect = false;
          throw new Error("synthetic socket failure");
        }
      }
    };
    const { gateway, store, trustedClientId, token, sessionId } = await revocationFixture({ socket, custody: custody(forgotten) });
    failDisconnect = true;
    const revoke = () => kind === "operator" ? gateway.revokeTrustedClient(trustedClientId) : gateway.access.forgetByCredential(token);
    await expect(revoke()).rejects.toThrow("synthetic socket failure");
    expect(store.clients[0]?.revokedAt).toBeDefined();
    expect(gateway.snapshot().sessions.find((session) => session.sessionId === sessionId)?.status).toBe("ready");
    await expect(revoke()).resolves.toBe(false);
    expect(gateway.snapshot().sessions.find((session) => session.sessionId === sessionId)?.status).toBe("disconnected");
    expect(forgotten).toHaveBeenCalledTimes(2);
    expect(store.saves).toBe(2);
    expect(gateway.snapshot().auditLog.filter((entry) => entry.type === "trust.revoked")).toHaveLength(1);
  });

  it("retries disconnect failure even though the durable trust is already revoked", async () => {
    const { gateway, store, trustedClientId, sessionId } = await revocationFixture();
    const original = gateway.disconnect.bind(gateway);
    vi.spyOn(gateway, "disconnect").mockImplementationOnce(() => { throw new Error("synthetic disconnect failure"); }).mockImplementation(original);
    await expect(gateway.revokeTrustedClient(trustedClientId)).rejects.toThrow("synthetic disconnect failure");
    expect(store.clients[0]?.revokedAt).toBeDefined();
    await expect(gateway.revokeTrustedClient(trustedClientId)).resolves.toBe(false);
    expect(gateway.snapshot().sessions.find((session) => session.sessionId === sessionId)?.status).toBe("disconnected");
    expect(store.saves).toBe(2);
  });

  it("retries audited nonfatal custody failure on the next teardown", async () => {
    const forgotten = vi.fn(async () => undefined).mockRejectedValueOnce(new Error("synthetic custody details"));
    const { gateway, store, trustedClientId } = await revocationFixture({ custody: custody(forgotten) });
    await expect(gateway.revokeTrustedClient(trustedClientId)).resolves.toBe(true);
    await expect(gateway.revokeTrustedClient(trustedClientId)).resolves.toBe(false);
    expect(forgotten).toHaveBeenCalledTimes(2);
    const audit = gateway.snapshot().auditLog;
    expect(audit.filter((entry) => entry.type === "credential_custody.failed")).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain("synthetic custody details");
    expect(store.saves).toBe(2);
  });

  it("lets custody revoke another client without holding the mutation queue", async () => {
    let nested: () => Promise<void> = async () => undefined;
    let firstId = "";
    const forgotten = vi.fn(async (id: string) => { if (id === firstId) await nested(); });
    const { gateway, store, pair, trustedClientId } = await revocationFixture({ custody: custody(forgotten) });
    const other = await pair("extension.reentrant");
    firstId = trustedClientId;
    nested = async () => { expect(await gateway.revokeTrustedClient(other.trustedClientId)).toBe(true); };
    await expect(gateway.revokeTrustedClient(trustedClientId)).resolves.toBe(true);
    expect(store.clients.every((client) => client.revokedAt !== undefined)).toBe(true);
    expect(forgotten).toHaveBeenCalledTimes(2);
  });
});
