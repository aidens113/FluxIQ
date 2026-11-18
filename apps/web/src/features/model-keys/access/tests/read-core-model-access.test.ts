import { describe, expect, it } from "vitest";
import { readCoreModelAccess } from "../read-core-model-access";

const key = { id: "k1", name: "Work", provider: "deepseek", model: "m" };
const ready = { status: "ready", message: "Ready.", key, lastCall: null };

describe("reading Core's model-access state from the snapshot", () => {
  it("keeps a valid state as it is", () => {
    expect(readCoreModelAccess(ready)).toEqual(ready);
    expect(readCoreModelAccess({ status: "no_key", message: "Add one.", key: null, lastCall: null })?.status).toBe("no_key");
    expect(readCoreModelAccess({ status: "key_unopenable", message: "x", key, lastCall: null, unopenableCode: "host_protection_unavailable" })?.unopenableCode).toBe("host_protection_unavailable");
  });

  it.each([
    ["nothing", undefined],
    ["a string", "ready"],
    ["an unknown status", { ...ready, status: "locked" }],
    ["no sentence", { ...ready, message: "  " }],
    ["a ready state with no key", { ...ready, key: null }],
    ["a no-key state with a key", { status: "no_key", message: "x", key, lastCall: null }],
    ["a refusal with no refused call", { status: "provider_refused", message: "x", key, lastCall: null }],
    ["an unopenable key with no code", { status: "key_unopenable", message: "x", key, lastCall: null }],
    ["a code on a ready state", { ...ready, unopenableCode: "ciphertext_invalid" }],
    ["a provider it does not know", { ...ready, key: { ...key, provider: "other" } }]
  ])("reads %s as no state, which the card shows as Update FluxIQ", (_name, value) => {
    expect(readCoreModelAccess(value)).toBeNull();
  });
});
