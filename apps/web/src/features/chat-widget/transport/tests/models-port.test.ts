import { expect, it } from "vitest";
import { fakeProgramApi } from "../../tests/fake-program-api";
import { createModelsPort } from "../models-port";

it("preserves sanitized availability and legacy refusal without leaking secret metadata", async () => {
  const keys = [
    { kind: "llm", provider: "Anthropic", enabled: true, availability: { state: "available", private: "PRIVATE" }, name: "PRIVATE", value: "PRIVATE" },
    { kind: "llm", enabled: true, heldByYou: false, availability: { state: "unavailable", code: "legacy_recovery_required", ciphertext: "PRIVATE" } },
    { kind: "llm", enabled: true, unlocked: false, lockedBecause: "signed_out", unlockTicket: "PRIVATE" }
  ];
  const api = fakeProgramApi({ snapshot: { ok: true, payload: { keys, unlockTicket: "PRIVATE", lockedClients: ["PRIVATE"] } } });
  const result = await createModelsPort(api).readKeys();
  expect(result).toEqual({ ok: true, value: { keys: [
    { kind: "llm", provider: "Anthropic", enabled: true, availability: { state: "available" } },
    { kind: "llm", enabled: true, heldByYou: false, availability: { state: "unavailable", code: "legacy_recovery_required" } },
    { kind: "llm", enabled: true, unlocked: false }
  ] } });
  expect(JSON.stringify(result)).not.toContain("PRIVATE");
  expect(api.calls).toEqual([{ method: "get", endpoint: "snapshot", payload: undefined }]);
});

it("retains malformed status as unknown instead of dropping it into legacy-ready behavior", async () => {
  const api = fakeProgramApi({ snapshot: { ok: true, payload: { keys: [
    { kind: "llm", enabled: true, availability: { state: "unavailable", code: "future" } },
    { kind: "llm", enabled: "true", provider: 7 }, null
  ] } } });
  expect(await createModelsPort(api).readKeys()).toEqual({ ok: true, value: { keys: [
    { kind: "llm", enabled: true, availability: null },
    { kind: "llm", enabled: null, provider: null }, null
  ] } });
});

it("retains actual authorization refusal and failed status reads", async () => {
  const api = fakeProgramApi({ snapshot: { ok: false, status: 403, code: "permission_denied", error: "No access" } });
  expect(await createModelsPort(api).readKeys()).toMatchObject({ ok: false, code: "permission_denied" });
});
