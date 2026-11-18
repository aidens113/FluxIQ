// What the host's model paths read about each person's key (t928, F1): the
// workspace's choice, the person's own saved choice, and what the panel
// assistant answers each person with. Real Secret Keys in memory; dummy values;
// nothing is released, so no ports beyond the key list are used.
import { describe, expect, it } from "vitest";
import type { AutomationStudioSessionKeyPorts } from "../../../../runtime/models/secrets/index.ts";
import { SecretKeysService } from "../../../secret-keys/index.ts";
import { WEAK_SCRYPT_PARAMETERS, createMemoryRepository, hostProtectionOptions } from "../../../secret-keys/runtime/tests/secret-key-fixtures.ts";
import { callerModelKeyChoices } from "../caller-key-choices.ts";

function workspace() {
  const keys = new SecretKeysService({ repository: createMemoryRepository().repository, passwordKdf: { testOnlyWeakParameters: WEAK_SCRYPT_PARAMETERS }, ...hostProtectionOptions() });
  const unused = () => { throw new Error("No key is released in these tests."); };
  const ports: AutomationStudioSessionKeyPorts = { snapshot: () => keys.snapshot(), createUseAuthorization: unused, revealKeyWithAuthorization: unused, revokeRevealAuthorization: unused };
  const add = (name: string, createdBy: string, provider = "Anthropic") => keys.createKey({ name, value: `dummy-${name}`, kind: "llm", provider, createdBy });
  return { keys, choices: callerModelKeyChoices({ keys, ports }), add };
}

describe("each person's key, as the host's model paths read it", () => {
  it("answers the panel assistant with a person's own saved key, never lent, and everyone else with the workspace's lent key", async () => {
    const { keys, choices, add } = workspace();
    const team = await add("Team", "alice");
    await keys.modelKeys.keySavedBy(team.id, "alice");
    await keys.modelKeys.setAssistant({ keyId: team.id, model: "claude-haiku-5-5", chosenBy: "alice" });
    await keys.modelKeys.setOffered(team.id, true, "alice");
    const bobs = await add("Bob's", "bob", "DeepSeek");
    await keys.modelKeys.keySavedBy(bobs.id, "bob");

    expect(await choices.ownKeyId("bob")).toBe(bobs.id);
    expect(await choices.preferred()).toMatchObject({ keyId: team.id, model: "claude-haiku-5-5", ownerId: "alice", chosenForWorkspace: true, offeredByHolder: true });
    expect(await choices.assistantKeyFor("bob")).toEqual({ ok: true, keyId: bobs.id, keyName: "Bob's", provider: "DeepSeek", ownerId: "bob", chosenForWorkspace: false, offeredByHolder: false });
    expect(await choices.assistantKeyFor("mia")).toMatchObject({ ok: true, keyId: team.id, model: "claude-haiku-5-5", ownerId: "alice", chosenForWorkspace: true, offeredByHolder: true });
    expect(await choices.assistantKeyFor("alice")).toMatchObject({ ok: true, keyId: team.id, model: "claude-haiku-5-5" });
    keys.close();
  });

  it("keeps the workspace's own answer when nobody's key could serve the person, so its refusal words still reach them", async () => {
    const { keys, choices, add } = workspace();
    const team = await add("Team", "alice");
    await keys.modelKeys.setAssistant({ keyId: team.id, chosenBy: "alice" });
    // Chosen but not offered: the assistant says so in its own words for someone with no key.
    expect(await choices.assistantKeyFor("mia")).toMatchObject({ ok: true, keyId: team.id, chosenForWorkspace: true, offeredByHolder: false });
    await keys.deleteKey(team.id);
    expect(await choices.assistantKeyFor("mia")).toEqual({ ok: false, reason: "Add a model key in Settings to use the assistant." });
    keys.close();
  });

  it("falls back to a person's own key when the workspace was left with none", async () => {
    const { keys, choices, add } = workspace();
    const team = await add("Team", "alice");
    await keys.modelKeys.keySavedBy(team.id, "alice");
    const bobs = await add("Bob's", "bob");
    await keys.deleteKey(team.id);
    expect(await keys.modelKeys.resolveAssistant()).toMatchObject({ ok: false });
    expect(await choices.assistantKeyFor("bob")).toMatchObject({ ok: true, keyId: bobs.id, ownerId: "bob" });
    expect(await choices.assistantKeyFor("mia")).toMatchObject({ ok: false, reason: expect.stringMatching(/No model key is chosen/u) });
    keys.close();
  });
});
