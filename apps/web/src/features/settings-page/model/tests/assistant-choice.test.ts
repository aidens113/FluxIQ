import { describe, expect, it } from "vitest";
import { assistantChoice } from "../assistant-choice";
import { assistantModelPayload } from "../assistant-model-payload";
import type { SettingsKey, SettingsModelChoices } from "../types";

const keys: SettingsKey[] = [
  { id: "a", name: "Work", kind: "llm", provider: "Anthropic", enabled: true },
  { id: "b", name: "Cheap", kind: "llm", provider: "DeepSeek", enabled: true },
  { id: "c", name: "Off", kind: "llm", provider: "Anthropic", enabled: false }
];
const choices = (over: Partial<SettingsModelChoices> = {}): SettingsModelChoices => ({ defaultKeyId: "a", assistantKeyId: null, assistantModel: null, assistantAllowanceUsd: null, ...over });

describe("the assistant's key and model", () => {
  it("uses the default key and its normal model when nothing is picked", () => {
    const choice = assistantChoice(keys, choices());
    expect(choice.keyId).toBe("");
    expect(choice.effectiveKey?.id).toBe("a");
    expect(choice.model).toBe("");
    expect(choice.keys.map((key) => key.id)).toEqual(["a", "b"]);
    expect(choice.models).toContain("claude-sonnet-5-5");
  });

  it("offers the picked key's provider models, not the default's", () => {
    const choice = assistantChoice(keys, choices({ assistantKeyId: "b", assistantModel: "deepseek-flash" }));
    expect(choice.effectiveKey?.id).toBe("b");
    expect(choice.models).toContain("deepseek-flash");
    expect(choice.model).toBe("deepseek-flash");
  });

  it("drops a model that belongs to another provider", () => {
    expect(assistantChoice(keys, choices({ assistantKeyId: "b", assistantModel: "claude-sonnet-5-5" })).model).toBe("");
  });

  it("falls back to the default when the picked key is off or gone", () => {
    expect(assistantChoice(keys, choices({ assistantKeyId: "c" })).keyId).toBe("");
  });

  it("says nothing is usable with no enabled key", () => {
    expect(assistantChoice([], choices()).effectiveKey).toBeUndefined();
  });

  it("is the person's own choice, with nothing shown as the workspace's, when the key is in their list", () => {
    expect(assistantChoice(keys, choices()).workspace).toBeNull();
    expect(assistantChoice([], choices({ defaultKeyId: null })).workspace).toBeNull();
  });

  it("shows the workspace's key by provider and model when it is not among the person's own keys", () => {
    const member = assistantChoice([], choices({ defaultKeyId: "team", assistantKeyId: "team", assistantModel: "claude-haiku-5-5", assistantProvider: "Anthropic" }));
    expect(member.workspace).toEqual({ provider: "Anthropic", model: "claude-haiku-5-5" });
    // A member with keys of their own still sees the workspace's, which is what answers.
    expect(assistantChoice(keys, choices({ defaultKeyId: "team", assistantProvider: "DeepSeek" })).workspace).toEqual({ provider: "DeepSeek", model: "" });
  });

  it("shows a person who does not choose for the workspace the key in use, even their own, with nothing to change", () => {
    // Their own key is the workspace's default: shown, not offered.
    expect(assistantChoice(keys, choices({ mayChoose: false, assistantProvider: "Anthropic" })).workspace).toEqual({ provider: "Anthropic", model: "" });
    // Their own key picked for the assistant, with a model; the key's own provider when the answer names none.
    expect(assistantChoice(keys, choices({ mayChoose: false, assistantKeyId: "b", assistantModel: "deepseek-flash" })).workspace).toEqual({ provider: "DeepSeek", model: "deepseek-flash" });
    // No stored choice: the engine's first enabled key, still not theirs to choose.
    expect(assistantChoice(keys, choices({ mayChoose: false, defaultKeyId: null })).workspace).toEqual({ provider: "Anthropic", model: "" });
    // No key at all: nothing to show as the workspace's, so the page asks them to add one.
    expect(assistantChoice([], choices({ mayChoose: false, defaultKeyId: null })).workspace).toBeNull();
  });

  it("offers a person who chooses for the workspace their own key, as before", () => {
    expect(assistantChoice(keys, choices({ mayChoose: true })).workspace).toBeNull();
    expect(assistantChoice(keys, choices({ mayChoose: true, defaultKeyId: null })).workspace).toBeNull();
  });

  it("builds a payload that leaves out what means the default", () => {
    expect(assistantModelPayload({ keyId: "", model: "" })).toEqual({});
    expect(assistantModelPayload({ keyId: "b", model: "deepseek-flash" })).toEqual({ keyId: "b", model: "deepseek-flash" });
  });
});
