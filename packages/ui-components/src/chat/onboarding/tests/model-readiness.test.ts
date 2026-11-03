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
  assert.equal(await readModelReadiness(answering(keys([{ kind: "model", provider: "deepseek", enabled: false }, { kind: "model", provider: "openai", enabled: true }])).models), "ready");
});

test("no key, or only a disabled one, is missing", async () => {
  assert.equal(await readModelReadiness(answering(keys([])).models), "missing");
  assert.equal(await readModelReadiness(answering(keys([{ kind: "model", provider: "deepseek", enabled: false }])).models), "missing");
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
