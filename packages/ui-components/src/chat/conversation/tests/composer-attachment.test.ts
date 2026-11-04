import assert from "node:assert/strict";
import { test } from "vitest";
import { createRecordingAttachment } from "../../attachment/index.ts";
import { createElement } from "../../../dom/index.ts";
import { fake, withFakeDocument } from "../../../testing/index.ts";
import { recordingsOver } from "../../tests/message-transport.ts";
import { createComposer } from "../composer.ts";
import type { ConversationState } from "../controller.ts";

const ready: ConversationState = { mode: "thread", turns: [], reading: false, sending: false, answering: new Set(), answerErrors: new Map() };
const list = recordingsOver(async () => ({
  ok: true,
  value: { recordings: { items: [{ id: "rec-1", description: "Add a coffee to the cart", status: "completed", projectId: "p1", startedAt: 1, endedAt: 2 }] } }
}));
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function scenario(sentOk: boolean): Promise<void> {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined } });
  try {
    await withFakeDocument(async () => {
      const calls: Array<[string, string | undefined]> = [];
      let finish!: (sent: boolean) => void;
      const attachment = createRecordingAttachment(list, () => "p1");
      const composer = createComposer((text, recordingId) => {
        calls.push([text, recordingId]);
        return new Promise((resolve) => {
          finish = resolve;
        });
      }, attachment);
      composer.render(ready);
      const root = fake(composer.element);
      const names = root.descendants().filter((node) => node.tagName === "BUTTON").map((node) => node.getAttribute("aria-label"));
      assert.deepEqual(names.filter((name) => name === "Attach a recording" || name === "Send"), ["Attach a recording", "Send"], "the attach button sits beside Send");
      fake(attachment.button).dispatch("click");
      await flush();
      fake(attachment.menu).querySelectorAll("button")[0]!.dispatch("click");
      assert.equal(fake(attachment.chip).textContent.startsWith("Recording: Add a coffee to the cart"), true);
      composer.fill("build this from my recording");
      root.descendants().find((node) => node.id === "conversationSendButton")!.dispatch("click");
      assert.deepEqual(calls, [["build this from my recording", "rec-1"]]);
      finish(sentOk);
      await flush();
      composer.render(ready);
      assert.equal(fake(attachment.chip).hidden, sentOk, sentOk ? "the chip clears after a send" : "the chip stays after a failed send");
      assert.equal(attachment.current() === undefined, sentOk);
    });
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
}

test("a sent message carries the recording and the chip clears", () => scenario(true));
test("a failed send keeps the chip", () => scenario(false));

test("a message with nothing attached sends no recording id", async () => {
  await withFakeDocument(async () => {
    const calls: unknown[][] = [];
    const composer = createComposer((...args) => {
      calls.push(args);
      return Promise.resolve(true);
    }, createRecordingAttachment(list, () => "p1"));
    composer.render(ready);
    composer.fill("hello");
    fake(composer.element).descendants().find((node) => node.id === "conversationSendButton")!.dispatch("click");
    assert.deepEqual(calls, [["hello"]]);
  });
});

const none = recordingsOver(async () => ({ ok: true, value: { recordings: { items: [] } } }));

test("a host action sits between the attach button and Send, and the field takes the buttons-row layout", async () => {
  await withFakeDocument(async () => {
    const action = createElement("button", { id: "hostAction", text: "Show me how", attrs: { type: "button", "aria-label": "Start recording" } });
    const composer = createComposer(() => Promise.resolve(true), createRecordingAttachment(none, () => "p1"), { action, keepDraft: false });
    composer.render(ready);
    const field = fake(composer.element).descendants().find((node) => node.className.includes("composer-field"))!;
    assert.equal(field.className.includes("composer-field-tools"), true);
    const ids = field.children.map((node) => node.id || node.getAttribute("aria-label"));
    assert.deepEqual(ids, ["conversationInput", "conversationAttachButton", "hostAction", "conversationSendButton"]);
  });
});

test("without a host action the field is unchanged", async () => {
  await withFakeDocument(async () => {
    const composer = createComposer(() => Promise.resolve(true), createRecordingAttachment(none, () => "p1"), { keepDraft: false });
    const field = fake(composer.element).descendants().find((node) => node.className.includes("composer-field"))!;
    assert.equal(field.className.includes("composer-field-tools"), false);
    assert.equal(field.children.length, 3);
  });
});
