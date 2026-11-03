// What a host may change about the composer: a length limit with a hint that
// shows only once few characters are left, a draft kept in memory and never in
// the page's storage, and the words said on the send button.

import assert from "node:assert/strict";
import { test } from "vitest";
import { fake, withFakeDocument } from "../../../testing/index.ts";
import { createComposer } from "../composer.ts";
import type { ConversationState } from "../controller.ts";

const ready: ConversationState = { mode: "thread", turns: [], reading: false, sending: false, answering: new Set(), answerErrors: new Map() };

/** Runs `body` with a `localStorage` that counts what is written to it. */
async function withStorage(body: (writes: string[]) => Promise<void>): Promise<void> {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map<string, string>();
  const writes: string[] = [];
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      writes.push(key);
      values.set(key, value);
    },
    removeItem: (key: string) => { values.delete(key); }
  } });
  try {
    await body(writes);
  } finally {
    if (previous === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
    else Object.defineProperty(globalThis, "localStorage", previous);
  }
}

function parts(composer: ReturnType<typeof createComposer>) {
  const root = fake(composer.element);
  return {
    root,
    box: root.descendants().find((node) => node.id === "conversationInput")!,
    send: root.descendants().find((node) => node.id === "conversationSendButton")!,
    hint: root.byClass("composer-hint")[0]
  };
}

test("the box takes no more than maxLength, and the hint shows only under the threshold", async () => {
  await withFakeDocument(() => {
    const composer = createComposer(async () => true, undefined, { maxLength: 100, remainingHintBelow: 20 });
    composer.render(ready);
    const { box, hint } = parts(composer);
    assert.equal(box.getAttribute("maxlength"), "100");
    assert.ok(hint, "the hint exists once a limit and a threshold are given");
    assert.equal(hint.hidden, true);
    box.value = "x".repeat(80);
    box.dispatch("input");
    assert.equal(hint.hidden, true, "exactly 20 left is not under 20");
    box.value = "x".repeat(81);
    box.dispatch("input");
    assert.equal(hint.hidden, false);
    assert.equal(hint.textContent, "19 characters left.");
    box.value = "x".repeat(100);
    box.dispatch("input");
    assert.equal(hint.textContent, "0 characters left.");
    box.value = "short";
    box.dispatch("input");
    assert.equal(hint.hidden, true);
  });
});

test("no option, no limit, no hint, and the send button says what it did", async () => {
  await withFakeDocument(() => {
    const composer = createComposer(async () => true);
    composer.render(ready);
    const { box, hint, send } = parts(composer);
    assert.equal(box.getAttribute("maxlength"), null);
    assert.equal(hint, undefined);
    assert.equal(send.getAttribute("title"), "Send (Enter)");
    const worded = createComposer(async () => true, undefined, { sendHint: "Send (Enter). Shift and Enter start a new line." });
    assert.equal(parts(worded).send.getAttribute("title"), "Send (Enter). Shift and Enter start a new line.");
  });
});

test("keepDraft false keeps the draft in memory and writes no storage; the default does write it", async () => {
  await withStorage(async (writes) => {
    await withFakeDocument(() => {
      const memory = createComposer(async () => true, undefined, { keepDraft: false });
      memory.render(ready);
      const { box } = parts(memory);
      box.value = "a half-written thought";
      box.dispatch("input");
      memory.fill("another");
      assert.equal(box.value, "another");
      assert.deepEqual(writes, [], "nothing reached localStorage");
      const kept = createComposer(async () => true);
      kept.render(ready);
      const second = parts(kept).box;
      second.value = "kept";
      second.dispatch("input");
      assert.ok(writes.length > 0, "the default composer does keep its draft in storage");
    });
  });
});
