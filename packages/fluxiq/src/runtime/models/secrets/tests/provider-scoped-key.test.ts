import { describe, expect, it, vi } from "vitest";
import { releaseAutomationStudioSessionProviderKey, type AutomationStudioSessionKeyPorts, type AutomationStudioSessionKeySummary } from "../session-key.ts";

// t964: a key is its provider's, and the model it was saved with is a preference. The model ladder
// (t962) climbs from Haiku to Sonnet to Opus on one Claude key; before this, every decision after a
// climb failed provider_secret_unavailable because only a key saved with that exact model qualified.
function portsOver(keys: AutomationStudioSessionKeySummary[]): AutomationStudioSessionKeyPorts {
  return {
    snapshot: async () => ({ keys }),
    createUseAuthorization: vi.fn(async ({ id }) => ({ authorizationId: `use-${id}`, keyId: id, keyUpdatedAtMs: 1 })),
    revealKeyWithAuthorization: vi.fn(async ({ id }) => ({ value: `value-of-${id}` })),
    revokeRevealAuthorization: vi.fn()
  };
}

const claude = (id: string, model?: string): AutomationStudioSessionKeySummary => ({ id, kind: "llm", provider: "anthropic", enabled: true, updatedAtMs: 1, createdBy: "owner", ...(model ? { metadata: { model } } : {}) });
const caller = { userId: "owner", sessionId: "client-gateway:live" };

describe("a model key serves every model of its provider", () => {
  it("lets a key saved with Haiku pay for the Sonnet and Opus the ladder climbs to", async () => {
    const ports = portsOver([claude("haiku-key", "claude-haiku-5-5")]);
    for (const model of ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"]) {
      expect(await releaseAutomationStudioSessionProviderKey(ports, caller, { provider: "anthropic", model })).toBe("value-of-haiku-key");
    }
  });

  it("prefers a key saved with the requested model when the person has several", async () => {
    const ports = portsOver([claude("sonnet-key", "claude-sonnet-5-5"), claude("haiku-key", "claude-haiku-5-5")]);
    expect(await releaseAutomationStudioSessionProviderKey(ports, caller, { provider: "anthropic", model: "claude-haiku-5-5" })).toBe("value-of-haiku-key");
    expect(await releaseAutomationStudioSessionProviderKey(ports, caller, { provider: "anthropic", model: "claude-sonnet-5-5" })).toBe("value-of-sonnet-key");
    expect(await releaseAutomationStudioSessionProviderKey(ports, caller, { provider: "anthropic", model: "claude-opus-5-5" })).toBe("value-of-sonnet-key");
  });

  it("lets a Flow's named key serve any model of its provider and still refuses another provider", async () => {
    const ports = portsOver([claude("flow-key", "claude-haiku-5-5")]);
    expect(await releaseAutomationStudioSessionProviderKey(ports, caller, { provider: "anthropic", model: "claude-opus-5-5", flowKeyId: "flow-key" })).toBe("value-of-flow-key");
    await expect(releaseAutomationStudioSessionProviderKey(ports, caller, { provider: "deepseek", flowKeyId: "flow-key" })).rejects.toThrow(/model key/);
  });
});
