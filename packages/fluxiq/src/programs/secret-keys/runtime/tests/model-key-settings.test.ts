// The default model key and the assistant's model choice: who becomes the
// default, what happens when it goes, what the resolver names. Dummy values only.
import { describe, expect, it } from "vitest";
import { SecretKeysService } from "../service.ts";
import { WEAK_SCRYPT_PARAMETERS, createMemoryRepository } from "./secret-key-fixtures.ts";

const PASSWORD = "dummy-password";
const weakKdf = { testOnlyWeakParameters: WEAK_SCRYPT_PARAMETERS };

function workspace(repository = createMemoryRepository().repository) {
  const service = new SecretKeysService({ repository, passwordKdf: weakKdf });
  let at = 1000;
  const add = (name: string, extra: { provider?: string; kind?: "llm" | "custom"; enabled?: boolean } = {}) =>
    service.createKey({ name, value: `dummy-${name}`, authorizationPassword: PASSWORD, provider: extra.provider ?? "alpha", ...(extra.kind ? { kind: extra.kind } : {}), ...(extra.enabled === undefined ? {} : { enabled: extra.enabled }), nowMs: (at += 10) });
  return { service, add, repository };
}

describe("the default model key", () => {
  it("is the first key created, and later keys do not take it", async () => {
    const { service, add } = workspace();
    expect((await service.modelKeys.read()).defaultKeyId).toBeNull();
    const first = await add("First");
    await add("Second");
    expect((await service.snapshot()).modelSettings?.defaultKeyId).toBe(first.id);
  });

  it("never lands on a disabled key or a key that is not a model key", async () => {
    const { service, add } = workspace();
    await add("Off", { enabled: false });
    await add("Token", { kind: "custom" });
    expect((await service.modelKeys.read()).defaultKeyId).toBeNull();
    const on = await add("On");
    expect((await service.modelKeys.read()).defaultKeyId).toBe(on.id);
  });

  it("set-default-key makes another enabled key the default and refuses the rest in plain words", async () => {
    const { service, add } = workspace();
    await add("First");
    const second = await add("Second");
    const off = await add("Off", { enabled: false });
    const token = await add("Token", { kind: "custom" });
    expect((await service.modelKeys.setDefault(second.id)).defaultKeyId).toBe(second.id);
    await expect(service.modelKeys.setDefault("secret:nope")).rejects.toThrow("That key does not exist.");
    await expect(service.modelKeys.setDefault(off.id)).rejects.toThrow("turned off");
    await expect(service.modelKeys.setDefault(token.id)).rejects.toThrow("not a model key");
    expect((await service.modelKeys.read()).defaultKeyId).toBe(second.id);
  });

  it("passes to the next enabled key, oldest first, with a notice, when the default is deleted", async () => {
    const { service, add } = workspace();
    const first = await add("First");
    await add("Off", { enabled: false });
    const third = await add("Third");
    await add("Fourth");
    await service.deleteKey(first.id);
    const settings = await service.modelKeys.read();
    expect(settings.defaultKeyId).toBe(third.id);
    expect(settings.defaultNotice?.message).toBe("Your default key was removed, so Third is now the default.");
  });

  it("passes on when the default is disabled, and the notice goes once a default is picked", async () => {
    const { service, add } = workspace();
    const first = await add("First");
    const second = await add("Second");
    await service.updateKey({ id: first.id, enabled: false });
    const settings = await service.modelKeys.read();
    expect(settings.defaultKeyId).toBe(second.id);
    expect(settings.defaultNotice?.message).toBe("Your default key was disabled, so Second is now the default.");
    await service.modelKeys.setDefault(second.id);
    expect((await service.modelKeys.read()).defaultNotice).toBeUndefined();
  });

  it("is nothing once no model key is left, and says so", async () => {
    const { service, add } = workspace();
    const only = await add("Only");
    await service.deleteKey(only.id);
    const settings = await service.modelKeys.read();
    expect(settings.defaultKeyId).toBeNull();
    expect(settings.defaultNotice?.message).toContain("no other model key");
  });

  it("leaves the default alone when another key goes", async () => {
    const { service, add } = workspace();
    const first = await add("First");
    const second = await add("Second");
    await service.deleteKey(second.id);
    const settings = await service.modelKeys.read();
    expect(settings.defaultKeyId).toBe(first.id);
    expect(settings.defaultNotice).toBeUndefined();
  });

  it("survives a restart", async () => {
    const { service, add, repository } = workspace();
    await add("First");
    const second = await add("Second");
    await service.modelKeys.setDefault(second.id);
    const again = new SecretKeysService({ repository, passwordKdf: weakKdf });
    expect((await again.modelKeys.read()).defaultKeyId).toBe(second.id);
  });

  it("reads the oldest model key as the default in a store that has keys and no settings", async () => {
    const legacy = createMemoryRepository();
    const old = new SecretKeysService({ repository: legacy.repository, passwordKdf: weakKdf });
    const key = await old.createKey({ name: "Old", value: "dummy-old", authorizationPassword: PASSWORD, nowMs: 1 });
    legacy.replace("secret-keys:model-settings", { recordType: "other" });
    const reopened = new SecretKeysService({ repository: legacy.repository, passwordKdf: weakKdf });
    expect((await reopened.modelKeys.read()).defaultKeyId).toBe(key.id);
  });
});

describe("the assistant's model", () => {
  it("resolves to a plain reason with no model key", async () => {
    const { service } = workspace();
    await expect(service.modelKeys.resolveAssistant()).resolves.toEqual({ ok: false, reason: "Add a model key in Settings to use the assistant." });
  });

  it("uses the default key and the provider's normal model until told otherwise, and never carries a value", async () => {
    const { service, add } = workspace();
    const first = await add("First", { provider: "alpha" });
    const choice = await service.modelKeys.resolveAssistant();
    expect(choice).toEqual({ ok: true, keyId: first.id, keyName: "First", provider: "alpha" });
    expect(JSON.stringify(choice)).not.toContain("dummy-First");
  });

  it("follows a chosen key and model, and the model stays with its provider", async () => {
    const { service, add } = workspace();
    const first = await add("First", { provider: "alpha" });
    const second = await add("Second", { provider: "beta" });
    await service.modelKeys.setAssistant({ keyId: second.id, model: "beta-large" });
    expect(await service.modelKeys.resolveAssistant()).toMatchObject({ ok: true, keyId: second.id, model: "beta-large" });
    await service.modelKeys.setAssistant({ model: "alpha-small" });
    expect(await service.modelKeys.resolveAssistant()).toMatchObject({ ok: true, keyId: first.id, model: "alpha-small" });
    await service.modelKeys.setDefault(second.id);
    const moved = await service.modelKeys.resolveAssistant();
    expect(moved).toMatchObject({ ok: true, keyId: second.id });
    expect(moved).not.toHaveProperty("model");
  });

  it("refuses a key that does not exist or is disabled, with plain reasons", async () => {
    const { service, add } = workspace();
    await add("First");
    const off = await add("Off", { enabled: false });
    await expect(service.modelKeys.setAssistant({ keyId: "secret:nope" })).rejects.toThrow("That key does not exist.");
    await expect(service.modelKeys.setAssistant({ keyId: off.id })).rejects.toThrow("turned off");
  });

  it("refuses a model with no key to use it with", async () => {
    const { service } = workspace();
    await expect(service.modelKeys.setAssistant({ model: "any-model" })).rejects.toThrow("Add a model key in Settings");
  });

  it("goes back to the default key when its chosen key is disabled", async () => {
    const { service, add } = workspace();
    const first = await add("First");
    const second = await add("Second");
    await service.modelKeys.setAssistant({ keyId: second.id, model: "m" });
    await service.updateKey({ id: second.id, enabled: false });
    expect(await service.modelKeys.resolveAssistant()).toEqual({ ok: true, keyId: first.id, keyName: "First", provider: "alpha" });
    expect((await service.modelKeys.read()).assistantKeyId).toBeNull();
  });
});

describe("the assistant's spending allowance", () => {
  it("is unset until a person chooses one, then kept beside the model choice across a restart", async () => {
    const { service, repository } = workspace();
    expect(await service.modelKeys.assistantAllowance()).toBeUndefined();
    expect((await service.modelKeys.read()).assistantAllowanceUsd).toBeNull();
    expect(await service.modelKeys.setAssistantAllowance(1.25)).toBe(1.25);
    expect((await service.modelKeys.read()).assistantAllowanceUsd).toBe(1.25);
    const restarted = workspace(repository).service;
    expect(await restarted.modelKeys.assistantAllowance()).toBe(1.25);
    expect(await restarted.modelKeys.setAssistantAllowance(undefined)).toBeUndefined();
    expect((await restarted.modelKeys.read()).assistantAllowanceUsd).toBeNull();
  });

  it("refuses an allowance that is not a number of dollars, zero or more", async () => {
    const { service } = workspace();
    await expect(service.modelKeys.setAssistantAllowance(-1)).rejects.toThrow("zero or more");
    await expect(service.modelKeys.setAssistantAllowance(Number.NaN)).rejects.toThrow("zero or more");
    expect(await service.modelKeys.setAssistantAllowance(0)).toBe(0);
  });
});
