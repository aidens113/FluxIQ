import { describe, expect, it, vi } from "vitest";
import { releaseAutomationStudioSessionProviderKey, type AutomationStudioSessionKeyPorts } from "../session-key.ts";

const lent = { id: "lent", kind: "llm", provider: "anthropic", enabled: true, updatedAtMs: 1, createdBy: "holder" };
const caller = { userId: "builder", sessionId: "client-gateway:live" };

function ports(consents: boolean): AutomationStudioSessionKeyPorts {
  return {
    snapshot: async () => ({ keys: [lent] }),
    // Secret Keys checks both consents on a workspace release; the stub refuses without them.
    createUseAuthorization: vi.fn(async (input) => {
      if (!input.workspaceAssistant || !consents) throw new Error("This key is not lent to the workspace.");
      return { authorizationId: "one-use", keyId: "lent", keyUpdatedAtMs: 1 };
    }),
    revealKeyWithAuthorization: vi.fn(async () => ({ value: "fake-lent-value" })),
    revokeRevealAuthorization: vi.fn()
  };
}

describe("a key lent to the workspace, used by a person with no key of their own", () => {
  it("is released as its holder's for the workspace when both consents hold", async () => {
    const p = ports(true);
    expect(await releaseAutomationStudioSessionProviderKey(p, caller, { provider: "anthropic", flowKeyId: "lent", keyOwnerUserId: "holder" })).toBe("fake-lent-value");
    expect(p.createUseAuthorization).toHaveBeenCalledWith({ id: "lent", userId: "builder", sessionId: "client-gateway:live", ttlMs: 10_000, workspaceAssistant: true });
  });

  it("is refused without the consents, and no value is revealed", async () => {
    const p = ports(false);
    await expect(releaseAutomationStudioSessionProviderKey(p, caller, { provider: "anthropic", flowKeyId: "lent", keyOwnerUserId: "holder" })).rejects.toThrow("not lent");
    expect(p.revealKeyWithAuthorization).not.toHaveBeenCalled();
  });

  it("is refused when the claimed holder is not the key holder, and when no lending is claimed at all", async () => {
    const p = ports(true);
    await expect(releaseAutomationStudioSessionProviderKey(p, caller, { provider: "anthropic", flowKeyId: "lent", keyOwnerUserId: "someone-else" })).rejects.toThrow("belongs to another person");
    await expect(releaseAutomationStudioSessionProviderKey(p, caller, { provider: "anthropic", flowKeyId: "lent" })).rejects.toThrow("belongs to another person");
    expect(p.createUseAuthorization).not.toHaveBeenCalled();
  });
});
