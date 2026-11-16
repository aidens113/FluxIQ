import { describe, expect, it, vi } from "vitest";
import { AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL } from "../../../llm/index.ts";
import {
  createAutomationStudioResultCheckProvider,
  revealAutomationStudioResultCheckSecret,
  type AutomationStudioResultCheckProviderPorts,
  type AutomationStudioResultCheckProviderScope
} from "../index.ts";

const SECRET = "sk-live-not-a-real-key";

const scope: AutomationStudioResultCheckProviderScope = {
  projectId: "project.checks",
  flowId: "flow.catalogue",
  keyId: "secret:deepseek.default",
  authorizationId: "result-check:1",
  authorizedByUserId: "user.aiden",
  purpose: "loop_verification",
  maxEstimatedCostUsd: 0.05
};

const revoked: string[] = [];

function ports(overrides: Partial<AutomationStudioResultCheckProviderPorts> = {}): AutomationStudioResultCheckProviderPorts {
  return {
    getKeySummary: async (id) => ({ id, kind: "llm", enabled: true, updatedAtMs: 55 }),
    createUseAuthorization: async () => ({ authorizationId: "secret-reveal:1", keyId: scope.keyId, keyUpdatedAtMs: 55 }),
    revealKeyWithAuthorization: async () => ({ value: SECRET }),
    revokeRevealAuthorization: (authorizationId) => { revoked.push(authorizationId); },
    ...overrides
  };
}

const reveal = (instance: AutomationStudioResultCheckProviderPorts, request: Partial<{ projectId: string; flowId: string; outboundBody: string }> = {}) =>
  revealAutomationStudioResultCheckSecret({
    ports: instance,
    scope,
    request: { projectId: scope.projectId, flowId: scope.flowId, outboundBody: "{\"messages\":[]}", ...request }
  });

describe("releasing the key for an unattended check", () => {
  it("authorizes the use as the person's standing grant on this Flow, naming no session or unlock", async () => {
    const created = vi.fn(async () => ({ authorizationId: "secret-reveal:1", keyId: scope.keyId, keyUpdatedAtMs: 55 }));
    await expect(reveal(ports({ createUseAuthorization: created }))).resolves.toBe(SECRET);
    expect(created).toHaveBeenCalledWith({
      id: scope.keyId,
      principal: { kind: "standing", userId: "user.aiden", authorizationId: "result-check:1", projectId: "project.checks", flowId: "flow.catalogue", purpose: "loop_verification" },
      ttlMs: 10_000
    });
  });

  it("refuses a request for a Flow the authorization was not given for", async () => {
    await expect(reveal(ports(), { flowId: "flow.other" })).rejects.toThrow("Result check scope mismatch.");
    await expect(reveal(ports(), { projectId: "project.other" })).rejects.toThrow("Result check scope mismatch.");
  });

  it("refuses when the key's authority refuses the grant now: a revoked client, a disabled person, an IAM denial", async () => {
    const refused = ports({ createUseAuthorization: async () => { throw new Error("Secret key use is not authorized."); } });
    await expect(reveal(refused)).rejects.toThrow("Secret key use is not authorized.");
  });

  it("refuses a key that is gone, disabled, or no longer an LLM key", async () => {
    await expect(reveal(ports({ getKeySummary: async () => null }))).rejects.toThrow("is unavailable");
    await expect(reveal(ports({ getKeySummary: async (id) => ({ id, kind: "llm", enabled: false, updatedAtMs: 55 }) }))).rejects.toThrow("is unavailable");
    await expect(reveal(ports({ getKeySummary: async (id) => ({ id, kind: "api", enabled: true, updatedAtMs: 55 }) }))).rejects.toThrow("is unavailable");
  });

  it("refuses, and revokes the reveal it minted, when the key changed underneath the authorization", async () => {
    revoked.length = 0;
    const rotated = ports({ createUseAuthorization: async () => ({ authorizationId: "secret-reveal:2", keyId: scope.keyId, keyUpdatedAtMs: 99 }) });
    await expect(reveal(rotated)).rejects.toThrow("changed");
    expect(revoked).toEqual(["secret-reveal:2"]);
  });

  it("refuses to send a request that already carries the credential", async () => {
    await expect(reveal(ports(), { outboundBody: `{"key":"${SECRET}"}` })).rejects.toThrow("contains the configured credential");
  });
});

describe("the provider a standing authorization resolves to", () => {
  // The model name is read from the models module rather than written out
  // here. Spelling it out is what left this test red from 2026-09-23, when the
  // default moved to `deepseek-flash` and this expectation did not.
  it("is the configured default DeepSeek model, carrying the ceiling the redemption worked out", () => {
    const resolved = createAutomationStudioResultCheckProvider({ ports: ports(), scope });
    expect(resolved.maxEstimatedCostUsd).toBe(0.05);
    expect(resolved.provider.metadata).toEqual({ provider: "deepseek", model: AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL });
  });
});
