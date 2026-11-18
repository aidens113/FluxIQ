import { describe, expect, it } from "vitest";
import { modelAccessWords } from "../../words.ts";
import type { CoreModelAccess } from "../core-model-access.ts";
import { modelAccessFromCore } from "../from-core.ts";

const key = { id: "k1", name: "Work key", provider: "anthropic", model: "claude-haiku-5-5" };
const core = (status: CoreModelAccess["status"], extra: Partial<CoreModelAccess> = {}): CoreModelAccess => ({ status, message: "Core says so.", key, lastCall: null, ...extra });

describe("modelAccessFromCore", () => {
  it("maps each Core status onto one of the seven card states", () => {
    expect(modelAccessFromCore(core("ready"))).toEqual({ kind: "ready", provider: "Anthropic", keyName: "Work key" });
    expect(modelAccessFromCore(core("no_key", { key: null }))).toEqual({ kind: "no-key" });
    expect(modelAccessFromCore(core("key_unopenable", { unopenableCode: "ciphertext_invalid" }))).toEqual({ kind: "cant-open", keyName: "Work key", message: "Core says so." });
    expect(modelAccessFromCore(core("provider_refused"))).toEqual({ kind: "not-accepted", provider: "Anthropic", keyName: "Work key" });
    expect(modelAccessFromCore(core("provider_unreachable", { key: { ...key, provider: "deepseek" } }))).toEqual({ kind: "unreachable", provider: "DeepSeek" });
  });
  it("maps an empty provider balance to no credit", () => {
    expect(modelAccessFromCore(core("no_credit"))).toEqual({ kind: "no-credit", provider: "Anthropic", keyName: "Work key" });
  });
  it("shows a key this person may not use as no key, with Core's words and an own-key action", () => {
    const state = modelAccessFromCore(core("not_permitted"));
    expect(state).toEqual({ kind: "no-key", message: "Core says so.", actionLabel: "Add your own key" });
    expect(modelAccessWords(state)).toMatchObject({ badge: "No key", sentence: "Core says so.", action: { id: "add-key", label: "Add your own key" } });
  });
  it("reads an absent or unreadable state as an old FluxIQ", () => {
    expect(modelAccessFromCore(null)).toEqual({ kind: "update-fluxiq" });
    expect(modelAccessFromCore(undefined)).toEqual({ kind: "update-fluxiq" });
  });
  it("says when a ready key last answered, and only for an answer", () => {
    const at = Date.UTC(2026, 10, 17, 12, 0, 0);
    const answered = modelAccessFromCore(core("ready", { lastCall: { outcome: "answered", atMs: at } }));
    expect(answered).toMatchObject({ lastAnsweredAtMs: at });
    expect(modelAccessWords(answered, at + 5 * 60_000).sentence).toBe("Anthropic is ready, using Work key. It last answered 5 min ago.");
    expect(modelAccessFromCore(core("ready", { lastCall: { outcome: "provider_unreachable", atMs: at } }))).not.toHaveProperty("lastAnsweredAtMs");
  });
});
