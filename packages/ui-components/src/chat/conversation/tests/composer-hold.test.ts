import assert from "node:assert/strict";
import { test } from "vitest";
import { fake, withFakeDocument } from "../../../testing/index.ts";
import { createComposer } from "../composer.ts";
import type { ConversationState } from "../controller.ts";

const state: ConversationState = { mode: "loading", turns: [], reading: true, sending: false, answering: new Set(), answerErrors: new Map(), projectId: "project-1", scopeState: "loading" };
const ready: ConversationState = { ...state, mode: "empty", reading: false, scopeState: "ready" };
const failed: ConversationState = { ...state, reading: false, scopeState: "error" };
const tick = () => new Promise<void>((resolve) => { setTimeout(resolve, 0); });

function mount() {
  const sent: string[] = [];
  const composer = createComposer(async (text) => {
    sent.push(text);
    return true;
  }, undefined, { keepDraft: false });
  const root = fake(composer.element);
  const box = root.descendants().find((node) => node.id === "conversationInput")!;
  const send = root.descendants().find((node) => node.id === "conversationSendButton")!;
  const line = root.byClass("composer-held")[0]!;
  const type = (words: string) => {
    box.value = words;
    box.dispatch("input");
  };
  return { composer, sent, box, send, line, type };
}

test("the box takes words while a thread's first read is on its way, and a send goes when it lands", async () => {
  await withFakeDocument(async () => {
    const { composer, sent, box, send, line, type } = mount();
    composer.render(state);
    assert.equal(box.disabled, false);
    assert.equal(box.placeholder, "Message FluxIQ");
    type("Find the kettles");
    assert.equal(send.disabled, false);
    box.dispatch("keydown", { key: "Enter", preventDefault: () => undefined });
    await tick();
    assert.deepEqual(sent, [], "nothing goes before the thread is ready");
    assert.equal(box.value, "Find the kettles", "the words stay in the box while they wait");
    assert.equal(line.hidden, false);
    assert.equal(line.textContent, "This goes as soon as the conversation is ready.");
    composer.render(state);
    await tick();
    assert.deepEqual(sent, [], "another render of the same read changes nothing");
    composer.render(ready);
    await tick();
    assert.deepEqual(sent, ["Find the kettles"]);
    assert.equal(box.value, "");
    assert.equal(line.hidden, true);
  });
});

test("typed but not sent, the words wait in the box and do not go by themselves", async () => {
  await withFakeDocument(async () => {
    const { composer, sent, box, type } = mount();
    composer.render(state);
    type("still thinking");
    composer.render(ready);
    await tick();
    assert.deepEqual(sent, []);
    assert.equal(box.value, "still thinking");
  });
});

test("changing the words lets go of the hold: what goes is what the person last pressed send on", async () => {
  await withFakeDocument(async () => {
    const { composer, sent, send, line, type } = mount();
    composer.render(state);
    type("first words");
    send.dispatch("click");
    type("better words");
    assert.equal(line.hidden, true);
    composer.render(ready);
    await tick();
    assert.deepEqual(sent, []);
    send.dispatch("click");
    await tick();
    assert.deepEqual(sent, ["better words"]);
  });
});

test("a read that fails sends nothing, says so, and keeps the words", async () => {
  await withFakeDocument(async () => {
    const { composer, sent, box, send, line, type } = mount();
    composer.render(state);
    type("Find the kettles");
    send.dispatch("click");
    composer.render(failed);
    await tick();
    assert.deepEqual(sent, []);
    assert.equal(box.value, "Find the kettles");
    assert.equal(box.disabled, true);
    assert.equal(line.textContent, "Not sent: the conversation could not be read. Your words are still here.");
    composer.render(ready);
    await tick();
    assert.deepEqual(sent, [], "a read that recovers does not send by itself what the person was told was not sent");
    assert.equal(box.value, "Find the kettles");
  });
});
