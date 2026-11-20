// The interim adapter from the chat's model readiness to the six model-access states.

import assert from "node:assert/strict";
import { test } from "vitest";
import { modelAccessFromReadiness } from "../access-from-readiness.ts";

const keys = [{ kind: "llm", provider: "anthropic", enabled: true, name: "Work key" }];

test("ready names the provider and key from the list, with plain fallbacks", () => {
  assert.deepEqual(modelAccessFromReadiness("ready", keys), { kind: "ready", provider: "Anthropic", keyName: "Work key" });
  assert.deepEqual(modelAccessFromReadiness("ready", [{ kind: "llm", enabled: true }]), { kind: "ready", provider: "DeepSeek", keyName: "DeepSeek key" });
  assert.deepEqual(modelAccessFromReadiness("ready"), { kind: "ready", provider: "Your AI provider", keyName: "your key" });
});

test("missing is no key; every unreadable cause is can't open; an old FluxIQ is update", () => {
  assert.deepEqual(modelAccessFromReadiness("missing"), { kind: "no-key" });
  for (const code of ["ciphertext_invalid", "host_protection_unavailable", "legacy_recovery_required"] as const) {
    assert.deepEqual(modelAccessFromReadiness(`unavailable:${code}`, keys), { kind: "cant-open", keyName: "Work key" });
  }
  assert.deepEqual(modelAccessFromReadiness("unavailable:upgrade_required"), { kind: "update-fluxiq" });
});

test("unknown claims nothing", () => {
  assert.equal(modelAccessFromReadiness("unknown"), null);
});
