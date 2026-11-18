import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_NO_MODEL_KEY_MESSAGE, chooseAutomationStudioCallerModelKey } from "../caller-key-choice.ts";
import type { AutomationStudioSessionKeySummary } from "../session-key.ts";

const key = (id: string, extra: Partial<AutomationStudioSessionKeySummary> = {}): AutomationStudioSessionKeySummary => ({ id, name: id, kind: "llm", enabled: true, updatedAtMs: 1, ...extra });

describe("which saved key a person's call uses", () => {
  it("lets the key decide the provider: a lone Anthropic key, stored as the panel stores it, is used", () => {
    const choice = chooseAutomationStudioCallerModelKey({ keys: [key("claude", { provider: "Anthropic", createdBy: "u1" })], userId: "u1" });
    expect(choice).toMatchObject({ ok: true, provider: "anthropic", key: { id: "claude" } });
    expect(choice.ok && choice.model).toMatch(/^claude-/u);
  });

  it("uses the Settings choice when it is theirs, with the model chosen for it", () => {
    const keys = [key("deep", { provider: "DeepSeek", createdBy: "u1" }), key("claude", { provider: "Anthropic", createdBy: "u1" })];
    expect(chooseAutomationStudioCallerModelKey({ keys, userId: "u1", preferred: { keyId: "claude", model: "deepseek-flash" } })).toMatchObject({ ok: true, key: { id: "claude" }, provider: "anthropic" });
    expect(chooseAutomationStudioCallerModelKey({ keys, userId: "u1", preferred: { keyId: "deep", model: "deepseek-v4-pro" } })).toMatchObject({ ok: true, key: { id: "deep" }, model: "deepseek-v4-pro" });
  });

  it("uses another person's key only when it is both chosen for the workspace and offered, and says which consent is missing", () => {
    const keys = [key("team", { provider: "Anthropic", createdBy: "owner" })];
    expect(chooseAutomationStudioCallerModelKey({ keys, userId: "u2", preferred: { keyId: "team", ownerId: "owner", chosenForWorkspace: true, offeredByHolder: true } })).toMatchObject({ ok: true, keyOwnerUserId: "owner" });
    expect(chooseAutomationStudioCallerModelKey({ keys, userId: "u2", preferred: { keyId: "team", ownerId: "owner", chosenForWorkspace: true } })).toMatchObject({ ok: false, status: "not_permitted", message: expect.stringMatching(/not been offered/u) });
    expect(chooseAutomationStudioCallerModelKey({ keys, userId: "u2", preferred: { keyId: "team", ownerId: "owner" } })).toMatchObject({ ok: false, status: "not_permitted", message: expect.stringMatching(/not been chosen/u) });
  });

  it("falls back to the person's own newest key, then a legacy key nobody is stamped on", () => {
    const keys = [key("other", { provider: "Anthropic", createdBy: "owner" }), key("mine", { provider: "DeepSeek", createdBy: "u2" }), key("legacy", { provider: "Anthropic" })];
    expect(chooseAutomationStudioCallerModelKey({ keys, userId: "u2", preferred: { keyId: "other", ownerId: "owner" } })).toMatchObject({ ok: true, key: { id: "mine" }, provider: "deepseek" });
    expect(chooseAutomationStudioCallerModelKey({ keys: [keys[0]!, keys[2]!], userId: "u2" })).toMatchObject({ ok: true, key: { id: "legacy" } });
  });

  it("puts the person's own saved choice ahead of a lent workspace key, which still serves someone with neither", () => {
    const keys = [key("team", { provider: "Anthropic", createdBy: "owner" }), key("mine", { provider: "DeepSeek", createdBy: "u2" })];
    const lent = { keyId: "team", ownerId: "owner", chosenForWorkspace: true, offeredByHolder: true, model: "claude-haiku-5-5" };
    expect(chooseAutomationStudioCallerModelKey({ keys, userId: "u2", preferred: lent, ownKeyId: "mine" })).toEqual(expect.objectContaining({ ok: true, key: expect.objectContaining({ id: "mine" }), provider: "deepseek" }));
    expect(chooseAutomationStudioCallerModelKey({ keys, userId: "u2", preferred: lent, ownKeyId: "mine" })).not.toHaveProperty("keyOwnerUserId");
    expect(chooseAutomationStudioCallerModelKey({ keys, userId: "u3", preferred: lent })).toMatchObject({ ok: true, key: { id: "team" }, keyOwnerUserId: "owner", model: "claude-haiku-5-5" });
  });

  it("ignores an own choice that names another person's key, or a key turned off, and chooses as if there were none", () => {
    const keys = [key("team", { provider: "Anthropic", createdBy: "owner" }), key("off", { provider: "DeepSeek", createdBy: "u2", enabled: false })];
    const lent = { keyId: "team", ownerId: "owner", chosenForWorkspace: true, offeredByHolder: true };
    expect(chooseAutomationStudioCallerModelKey({ keys, userId: "u2", preferred: lent, ownKeyId: "team" })).toMatchObject({ ok: true, key: { id: "team" }, keyOwnerUserId: "owner" });
    expect(chooseAutomationStudioCallerModelKey({ keys, userId: "u2", preferred: lent, ownKeyId: "off" })).toMatchObject({ ok: true, key: { id: "team" }, keyOwnerUserId: "owner" });
    expect(chooseAutomationStudioCallerModelKey({ keys, userId: "u2", ownKeyId: "off" })).toMatchObject({ ok: false, status: "no_key" });
  });

  it("keeps the workspace's model only when the person's own choice is the workspace's key", () => {
    const keys = [key("mine", { provider: "Anthropic", createdBy: "u1" }), key("other", { provider: "Anthropic", createdBy: "u1" })];
    expect(chooseAutomationStudioCallerModelKey({ keys, userId: "u1", preferred: { keyId: "mine", model: "claude-opus-5-5" }, ownKeyId: "mine" })).toMatchObject({ key: { id: "mine" }, model: "claude-opus-5-5" });
    const elsewhere = chooseAutomationStudioCallerModelKey({ keys, userId: "u1", preferred: { keyId: "mine", model: "claude-opus-5-5" }, ownKeyId: "other" });
    expect(elsewhere).toMatchObject({ key: { id: "other" } });
    expect(elsewhere.ok && elsewhere.model).not.toBe("claude-opus-5-5");
  });

  it("says no key only when no enabled model key Core can call exists", () => {
    const none = { ok: false, status: "no_key", message: AUTOMATION_STUDIO_NO_MODEL_KEY_MESSAGE };
    expect(chooseAutomationStudioCallerModelKey({ keys: [], userId: "u1" })).toEqual(none);
    expect(chooseAutomationStudioCallerModelKey({ keys: [key("off", { provider: "Anthropic", createdBy: "u1", enabled: false }), key("gpt", { provider: "OpenAI", createdBy: "u1" }), key("custom", { kind: "custom", createdBy: "u1" })], userId: "u1" })).toEqual(none);
  });
});
