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

  it("builds a payload that leaves out what means the default", () => {
    expect(assistantModelPayload({ keyId: "", model: "" })).toEqual({});
    expect(assistantModelPayload({ keyId: "b", model: "deepseek-flash" })).toEqual({ keyId: "b", model: "deepseek-flash" });
  });
});
