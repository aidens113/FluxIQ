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

  it("says no key only when no enabled model key Core can call exists", () => {
    const none = { ok: false, status: "no_key", message: AUTOMATION_STUDIO_NO_MODEL_KEY_MESSAGE };
    expect(chooseAutomationStudioCallerModelKey({ keys: [], userId: "u1" })).toEqual(none);
    expect(chooseAutomationStudioCallerModelKey({ keys: [key("off", { provider: "Anthropic", createdBy: "u1", enabled: false }), key("gpt", { provider: "OpenAI", createdBy: "u1" }), key("custom", { kind: "custom", createdBy: "u1" })], userId: "u1" })).toEqual(none);
  });
});
