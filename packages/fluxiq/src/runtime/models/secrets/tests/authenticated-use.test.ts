import { describe, expect, it, vi } from "vitest";
import { releaseAutomationStudioSessionProviderKey, type AutomationStudioSessionKeyPorts } from "../session-key.ts";

function fixture() {
  const ports: AutomationStudioSessionKeyPorts = {
    snapshot: async () => ({ keys: [{ id: "key", kind: "llm", provider: "anthropic", enabled: true, updatedAtMs: 1, createdBy: "owner" }] }),
    createUseAuthorization: vi.fn(async () => ({ authorizationId: "one-use", keyId: "key", keyUpdatedAtMs: 1 })),
    revealKeyWithAuthorization: vi.fn(async () => ({ value: "fake-provider-value" })),
    revokeRevealAuthorization: vi.fn()
  };
  return ports;
}

describe("authenticated provider-key use", () => {
  it("tries another eligible key only for a key-specific recovery failure, never for an explicit Flow key", async () => {
    const ports = fixture();
    const usable = (await ports.snapshot()).keys[0]!;
    ports.snapshot = async () => ({ keys: [{ ...usable, id: "old-unrecoverable" }, usable] });
    ports.createUseAuthorization = vi.fn(async ({ id }) => {
      if (id === "old-unrecoverable") throw Object.assign(new Error("Saved key requires recovery"), { code: "legacy_recovery_required" });
      return { authorizationId: "one-use", keyId: "key", keyUpdatedAtMs: 1 };
    });
    const caller = { userId: "owner", sessionId: "client-gateway:live" };
    expect(await releaseAutomationStudioSessionProviderKey(ports, caller, { provider: "anthropic" })).toBe("fake-provider-value");
    expect(ports.createUseAuthorization).toHaveBeenCalledTimes(2);
    await expect(releaseAutomationStudioSessionProviderKey(ports, caller, { provider: "anthropic", flowKeyId: "old-unrecoverable" })).rejects.toThrow("requires recovery");
    expect(ports.createUseAuthorization).toHaveBeenCalledTimes(3);
  });
  it("uses the actual client principal without any held panel session", async () => {
    const ports = fixture();
    const caller = { userId: "owner", sessionId: "client-gateway:live" };
    expect(await releaseAutomationStudioSessionProviderKey(ports, caller, { provider: "anthropic" })).toBe("fake-provider-value");
    expect(ports.createUseAuthorization).toHaveBeenCalledWith({ id: "key", userId: "owner", sessionId: "client-gateway:live", ttlMs: 10_000 });
  });
  it("does not replace a denied current principal with any other session", async () => {
    const ports = fixture();
    ports.createUseAuthorization = async () => { throw new Error("Current authority revoked"); };
    await expect(releaseAutomationStudioSessionProviderKey(ports, { userId: "owner", sessionId: "client-gateway:revoked" }, { provider: "anthropic" })).rejects.toThrow("Current authority revoked");
    expect(ports.revealKeyWithAuthorization).not.toHaveBeenCalled();
  });
  it("retains the requesting identity when the host selects a workspace payer", async () => {
    const ports = fixture();
    await releaseAutomationStudioSessionProviderKey(ports, { userId: "member", sessionId: "member-session" }, { provider: "anthropic", flowKeyId: "key", keyOwnerUserId: "owner" });
    expect(ports.createUseAuthorization).toHaveBeenCalledWith(expect.objectContaining({ userId: "member", sessionId: "member-session" }));
  });
  it("invalidates a minted reveal if the selected key changes", async () => {
    const ports = fixture();
    ports.createUseAuthorization = async () => ({ authorizationId: "stale", keyId: "key", keyUpdatedAtMs: 2 });
    await expect(releaseAutomationStudioSessionProviderKey(ports, { userId: "owner", sessionId: "session" }, { provider: "anthropic" })).rejects.toThrow("changed");
    expect(ports.revokeRevealAuthorization).toHaveBeenCalledWith("stale");
    expect(ports.revealKeyWithAuthorization).not.toHaveBeenCalled();
  });
});

describe("the ports type", () => {
  it("requires createUseAuthorization, so ports without it do not compile", () => {
    const { createUseAuthorization: _removed, ...legacy } = fixture();
    void _removed;
    // @ts-expect-error the legacy held-session shape is refused: createUseAuthorization is required.
    const refused: AutomationStudioSessionKeyPorts = legacy;
    void refused;
  });
});
