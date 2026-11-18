// Reading whether a model key is enabled through a fake request: a key that is
// enabled is ready; none, or only disabled ones, is missing; a failed relay or
// an unpromised shape is unknown, so the chat shows no line.

import assert from "node:assert/strict";
import { test } from "vitest";
import { readModelReadiness } from "../model-readiness.ts";
import { modelsOver, TEST_MESSAGES, type TestMessage } from "../../tests/message-transport.ts";
import type { ChatResult } from "../../ports/index.ts";

function answering(reply: ChatResult<unknown> | Error) {
  const sent: TestMessage[] = [];
  const request = async <T>(message: TestMessage): Promise<ChatResult<T>> => {
    sent.push(message);
    if (reply instanceof Error) {
      throw reply;
    }
    return reply as ChatResult<T>;
  };
  return { sent, request, models: modelsOver(request) };
}

const keys = (list: unknown) => ({ ok: true as const, value: { ok: true, payload: { keys: list } } });

test("asks the transport's model keys", async () => {
  const fake = answering(keys([]));
  await readModelReadiness(fake.models);
  assert.deepEqual(fake.sent, [{ type: TEST_MESSAGES.panelModelReadiness }]);
});

test("an enabled key is ready", async () => {
  assert.equal(await readModelReadiness(answering(keys([{ kind: "llm", provider: "deepseek", enabled: false }, { kind: "llm", provider: "anthropic", enabled: true, availability: { state: "available" } }])).models), "ready");
});

test("no key, or only a disabled one, is missing", async () => {
  assert.equal(await readModelReadiness(answering(keys([])).models), "missing");
  assert.equal(await readModelReadiness(answering(keys([{ kind: "llm", provider: "deepseek", enabled: false }])).models), "missing");
});

test("a relay failure or an unpromised reply is unknown", async () => {
  assert.equal(await readModelReadiness(answering({ ok: false, sentence: "FluxIQ is not connected." }).models), "unknown");
  assert.equal(await readModelReadiness(answering(new Error("port closed")).models), "unknown");
  assert.equal(await readModelReadiness(answering({ ok: true, value: { ok: true, payload: {} } }).models), "unknown");
  assert.equal(await readModelReadiness(answering({ ok: true, value: undefined }).models), "unknown");
});

test("a client with no models port is unknown, so the chat never claims a key is missing", async () => {
  assert.equal(await readModelReadiness(undefined), "unknown");
});

const enabled = { kind: "llm", provider: "anthropic", enabled: true };

test("saved-key unavailability retains its cause without inventing an authentication step", async () => {
  for (const code of ["legacy_recovery_required", "host_protection_unavailable", "ciphertext_invalid"] as const) {
    assert.equal(await readModelReadiness(answering(keys([{ ...enabled, availability: { state: "unavailable", code } }])).models), `unavailable:${code}`);
  }
  assert.equal(await readModelReadiness(answering(keys([{ ...enabled, availability: { state: "unavailable", code: "ciphertext_invalid" } }, { ...enabled, availability: { state: "available" } }])).models), "ready");
});

test("legacy metadata stays usable, but an explicit legacy lock requires an update", async () => {
  assert.equal(await readModelReadiness(answering(keys([{ ...enabled, unlocked: false, lockedBecause: "signed_out" }])).models), "unavailable:upgrade_required");
  assert.equal(await readModelReadiness(answering(keys([{ ...enabled, unlocked: false }, { ...enabled, unlocked: true }])).models), "ready");
  assert.equal(await readModelReadiness(answering(keys([{ ...enabled, enabled: false, unlocked: false }])).models), "missing");
  assert.equal(await readModelReadiness(answering(keys([enabled])).models), "ready");
  assert.equal(await readModelReadiness(answering(keys([{ ...enabled, unlocked: false, availability: { state: "available" } }])).models), "ready", "new availability supersedes obsolete metadata");
});

test("only compatible enabled model keys count as ready", async () => {
  for (const key of [{ ...enabled, kind: "custom" }, { ...enabled, provider: "OpenAI" }, { ...enabled, provider: "private-adapter" }]) {
    assert.equal(await readModelReadiness(answering(keys([{ ...key, availability: { state: "available" } }])).models), "missing");
  }
  for (const provider of [undefined, "DeepSeek", "Anthropic (Claude)"]) {
    assert.equal(await readModelReadiness(answering(keys([{ ...enabled, provider }])).models), "ready");
  }
});

test("foreign admin-visible keys do not count as the caller's model configuration", async () => {
  for (const availability of [undefined, { state: "available" }, { state: "unavailable", code: "legacy_recovery_required" }, null]) {
    assert.equal(await readModelReadiness(answering(keys([{ ...enabled, heldByYou: false, availability }])).models), "missing");
    assert.equal(await readModelReadiness(answering(keys([{ ...enabled, heldByYou: false, availability }, { ...enabled, heldByYou: true, availability: { state: "available" } }])).models), "ready");
  }
});

test("malformed records and explicit unknown availability never become ready or missing", async () => {
  for (const key of [null, [], {}, { ...enabled, enabled: "true" }, { ...enabled, provider: 123 }, { ...enabled, availability: null }, { ...enabled, availability: { state: "available", code: "ciphertext_invalid" } }, { ...enabled, availability: { state: "unavailable", code: "future_code" } }, { ...enabled, unlocked: "false" }]) {
    assert.equal(await readModelReadiness(answering(keys([key])).models), "unknown", JSON.stringify(key));
  }
  assert.equal(await readModelReadiness(answering(keys([{ ...enabled, availability: { state: "unavailable", code: "legacy_recovery_required" } }, { ...enabled, availability: { state: "unavailable", code: "future_code" } }])).models), "unknown");
  assert.equal(await readModelReadiness(answering(keys([{ ...enabled, availability: null }, { ...enabled, availability: { state: "available" } }])).models), "ready");
});
