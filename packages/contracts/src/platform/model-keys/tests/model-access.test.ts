import { describe, expect, it } from "vitest";
import { pairedClientModelAccessState, readModelAccessState } from "../model-access.ts";

const key = { id: "key.1", name: "Claude", provider: "anthropic", model: "claude-sonnet-4-5" } as const;

describe("model-access state", () => {
  it("keeps each status with only its own fields", () => {
    expect(readModelAccessState({ status: "no_key", message: "Add one.", key: null, lastCall: null, value: "not-forwarded" })).toEqual({ status: "no_key", message: "Add one.", key: null, lastCall: null });
    expect(readModelAccessState({ status: "ready", message: "Ready.", key: { ...key, value: "x" }, lastCall: { outcome: "answered", atMs: 5 } })).toEqual({ status: "ready", message: "Ready.", key, lastCall: { outcome: "answered", atMs: 5 } });
    expect(readModelAccessState({ status: "provider_refused", message: "Refused.", key, lastCall: { outcome: "provider_refused", atMs: 9 } })?.status).toBe("provider_refused");
    expect(readModelAccessState({ status: "provider_unreachable", message: "Offline.", key, lastCall: { outcome: "provider_unreachable", atMs: 9 } })?.status).toBe("provider_unreachable");
    expect(readModelAccessState({ status: "key_unopenable", message: "Sign in.", key, lastCall: null, unopenableCode: "legacy_recovery_required" })).toMatchObject({ unopenableCode: "legacy_recovery_required" });
    expect(readModelAccessState({ status: "not_permitted", message: "Not yours.", key: null, lastCall: null })?.status).toBe("not_permitted");
  });

  it("reads no_credit with its own call outcome and refuses it without one", () => {
    expect(readModelAccessState({ status: "no_credit", message: "No credit.", key, lastCall: { outcome: "no_credit", atMs: 4 } })?.status).toBe("no_credit");
    expect(readModelAccessState({ status: "no_credit", message: "No credit.", key, lastCall: { outcome: "provider_refused", atMs: 4 } })).toBeNull();
    expect(readModelAccessState({ status: "no_credit", message: "No credit.", key: null, lastCall: null })).toBeNull();
  });

  it("refuses a state that contradicts itself rather than showing it as ready", () => {
    for (const value of [
      null, [], {}, { status: "locked", message: "x", key: null, lastCall: null },
      { status: "ready", message: "x", key: null, lastCall: null },
      { status: "no_key", message: "x", key, lastCall: null },
      { status: "ready", message: "", key, lastCall: null },
      { status: "provider_refused", message: "x", key, lastCall: null },
      { status: "provider_refused", message: "x", key, lastCall: { outcome: "answered", atMs: 1 } },
      { status: "key_unopenable", message: "x", key, lastCall: null },
      { status: "ready", message: "x", key, lastCall: null, unopenableCode: "ciphertext_invalid" },
      { status: "ready", message: "x", key: { ...key, provider: "openai" }, lastCall: null },
      { status: "ready", message: "x", key, lastCall: { outcome: "answered", atMs: -1 } }
    ]) expect(readModelAccessState(value)).toBeNull();
  });

  it("leaves the key's id out for a paired client, and reads that back", () => {
    const paired = pairedClientModelAccessState({ status: "ready", message: "Ready.", key, lastCall: null });
    expect(paired.key).toEqual({ name: "Claude", provider: "anthropic", model: "claude-sonnet-4-5" });
    expect(readModelAccessState(paired)).toEqual(paired);
    expect(readModelAccessState({ status: "ready", message: "x", key: { ...key, id: "" }, lastCall: null })).toBeNull();
  });
});
