import { afterEach, describe, expect, it, vi } from "vitest";
import { SecretKeysService } from "../../../../../secret-keys/index.ts";
import { releaseAutomationStudioSessionProviderKey } from "../../session-keys/index.ts";
import { createAutomationStudioSessionKeyProviderResolver } from "../../session-key-provider.ts";
import { automationStudioPanelCommandKeyFromSecretKeys } from "../../deepseek/index.ts";
import { createAutomationStudioAnthropicPanelCommandModel } from "../panel-command.ts";
import { streamReply, textFor, request, DIAGNOSIS } from "./fixtures.ts";

const services: SecretKeysService[] = [];
afterEach(() => {
  for (const service of services.splice(0)) service.close();
  vi.unstubAllEnvs();
});
function secretKeys(): SecretKeysService {
  const service = new SecretKeysService({ passwordKdf: { testOnlyWeakParameters: { N: 2 ** 10, r: 8, p: 1, keyLength: 32 } } });
  services.push(service);
  return service;
}

describe("Claude keys, Flow resolution and panel requests", () => {
  it("releases an Anthropic key only to its owner's live unlock, resolves every call and refuses provider/model mismatch", async () => {
    const keys = secretKeys();
    const base = { kind: "llm" as const, authorizationPassword: "fake-password", createdBy: "person.one" };
    const claude = await keys.createKey({ ...base, name: "Claude", provider: "Anthropic", metadata: { model: "claude-sonnet-5-5" }, value: "dummy-claude-key" });
    await keys.createKey({ ...base, name: "DeepSeek", provider: "DeepSeek", value: "dummy-deepseek-key" });
    await keys.createKey({ ...base, createdBy: "person.two", name: "Other person's Claude", provider: "anthropic", value: "dummy-other-key" });
    const caller = { userId: "person.one", sessionId: "session.one" };
    await expect(releaseAutomationStudioSessionProviderKey(keys, caller, { provider: "anthropic" })).rejects.toMatchObject({ code: "secrets.locked" });
    await keys.unlockSession({ ...caller, authorizationPassword: "fake-password", expiresAtMs: Date.now() + 60_000 });
    expect(await releaseAutomationStudioSessionProviderKey(keys, caller, { provider: "anthropic" })).toBe("dummy-claude-key");
    await expect(releaseAutomationStudioSessionProviderKey(keys, caller, { provider: "deepseek", flowKeyId: claude.id })).rejects.toThrow(/model key/);
    await expect(releaseAutomationStudioSessionProviderKey(keys, caller, { provider: "anthropic", model: "claude-haiku-5-5", flowKeyId: claude.id })).rejects.toThrow(/model key/);
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer dummy-claude-key");
      return streamReply();
    });
    const resolve = createAutomationStudioSessionKeyProviderResolver({ ports: keys, fetchImpl: fetchImpl as typeof fetch });
    const resolved = resolve({ projectId: "project.one", flowId: "flow.one", caller: { actorUserId: caller.userId, actorSessionId: caller.sessionId }, providerId: "anthropic", modelId: "claude-sonnet-5-5", metadata: { llmSecretKeyId: claude.id } })!;
    expect(resolved.provider.metadata).toMatchObject({ provider: "anthropic", model: "claude-sonnet-5-5" });
    expect(resolved.tokenLimits).toEqual({ maxInputTokens: 992_000, maxOutputTokens: 8_000, maxTotalTokens: 1_000_000 });
    await expect(resolved.provider.runTask(request())).resolves.toMatchObject({ response: DIAGNOSIS });
    await keys.revokeSessionUnlock(caller.sessionId, { userId: caller.userId, administrator: false });
    await expect(resolved.provider.runTask(request())).rejects.toMatchObject({ code: "secrets.locked" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(() => resolve({ projectId: "project.one", flowId: "flow.one", caller: { actorUserId: caller.userId, actorSessionId: caller.sessionId }, providerId: "deepseek", modelId: "claude-sonnet-5-5" })).toThrow(/does not belong/);
  });

  it("routes chat with the chosen provider's key and charges decoded or rejected paid replies exactly once", async () => {
    const release = vi.fn(async () => "dummy-claude-key");
    const paid = vi.fn();
    const transcript = [{ author: "person" as const, text: "Hello." }, { author: "panel" as const, text: "Opened the workspace." }];
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const wire = JSON.parse(String(init?.body));
      expect(wire.messages).toEqual([...transcript.map((turn) => ({ role: turn.author === "person" ? "user" : "assistant", content: turn.author === "panel" ? `[The panel reported] ${turn.text}` : turn.text })), { role: "user", content: "Show my automations." }]);
      return streamReply(JSON.stringify({ result_json: '{"do":"flow.list"}' }));
    });
    const model = createAutomationStudioAnthropicPanelCommandModel({ resolveKey: release, fetchImpl: fetchImpl as typeof fetch });
    const execution = { signal: new AbortController().signal, caller: { userId: "person.one", sessionId: "session.one" }, paid };
    expect(await model.decide({ instructions: "Read the panel's request vocabulary.", transcript, message: "Show my automations.", correction: null }, execution)).toBe('{"do":"flow.list"}');
    expect(release).toHaveBeenCalledWith(execution.caller);
    expect(paid).toHaveBeenCalledTimes(1);
    expect(paid).toHaveBeenCalledWith(0.000555);
    paid.mockClear();
    const refused = createAutomationStudioAnthropicPanelCommandModel({ resolveKey: release, fetchImpl: (async () => streamReply(textFor(DIAGNOSIS), "refusal")) as typeof fetch });
    await expect(refused.decide({ instructions: "Read the request.", transcript: [], message: "Open it.", correction: null }, execution)).rejects.toMatchObject({ code: "llm.provider_output_invalid" });
    expect(paid).toHaveBeenCalledTimes(1);
    expect(paid).toHaveBeenCalledWith(0.000555);
  });

  it("honors the isolated Lab's five-dollar build ceiling without reserving native maximum output", async () => {
    vi.stubEnv("FLUXIQ_LLM_RUN_COST_CEILING_SCOPE", "test");
    vi.stubEnv("FLUXIQ_LLM_RUN_COST_CEILING_USD", "5");
    vi.resetModules();
    const scoped = await import("../../session-key-provider.ts");
    const resolve = scoped.createAutomationStudioSessionKeyProviderResolver({ ports: secretKeys() });
    const result = resolve({ projectId: "p", flowId: "f", caller: { actorUserId: "u", actorSessionId: "s" }, providerId: "anthropic", modelId: "claude-sonnet-5-5", metadata: { adaptationPolicySettings: { maxEstimatedCostUsdPerRun: 9 } } })!;
    expect(result).toMatchObject({ maxEstimatedCostUsd: 5, maxTotalEstimatedCostUsd: 5, tokenLimits: { maxOutputTokens: 8000 } });
    expect(result.provider.estimateCostUsd!({ inputTokens: 1000, outputTokens: 8000 })).toBeLessThan(0.1);
  });

  it("leaves the ordinary default at 25 cents and still narrows to explicit Flow policy", async () => {
    vi.stubEnv("FLUXIQ_LLM_RUN_COST_CEILING_SCOPE", "");
    vi.stubEnv("FLUXIQ_LLM_RUN_COST_CEILING_USD", "5");
    vi.resetModules();
    const scoped = await import("../../session-key-provider.ts");
    const resolve = scoped.createAutomationStudioSessionKeyProviderResolver({ ports: secretKeys() });
    const input = { projectId: "p", flowId: "f", caller: { actorUserId: "u", actorSessionId: "s" }, providerId: "anthropic", modelId: "claude-sonnet-5-5" };
    expect(resolve(input)).toMatchObject({ maxEstimatedCostUsd: 0.25, maxTotalEstimatedCostUsd: 0.25 });
    expect(resolve({ ...input, metadata: { adaptationPolicySettings: { maxEstimatedCostUsdPerRun: 0.05 } } })).toMatchObject({ maxEstimatedCostUsd: 0.05, maxTotalEstimatedCostUsd: 0.05 });
  });

  it("a missing Claude key never substitutes an enabled DeepSeek key", async () => {
    const keys = secretKeys();
    await keys.createKey({ name: "DeepSeek", kind: "llm", provider: "DeepSeek", value: "dummy-deepseek-key", authorizationPassword: "fake-password", createdBy: "person.one" });
    await keys.unlockSession({ userId: "person.one", sessionId: "session.one", authorizationPassword: "fake-password", expiresAtMs: Date.now() + 60_000 });
    await expect(automationStudioPanelCommandKeyFromSecretKeys(keys, { provider: "anthropic" })({ userId: "person.one", sessionId: "session.one" })).rejects.toThrow(/no enabled Anthropic/);
  });
});
