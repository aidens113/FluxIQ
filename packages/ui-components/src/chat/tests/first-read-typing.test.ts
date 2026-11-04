// The whole widget, as both clients mount it, with the thread's first read held
// open. A chat told its project (the panel always; the extension when it is
// navigated to one) holds a send until the read lands, because the read is what
// says the project may be spoken to. A chat following its host's project has no
// such read to wait for.

import assert from "node:assert/strict";
import { test } from "vitest";
import { createChatWidget } from "../chat-widget.ts";
import type { ChatOpenControlFactory, ChatResult } from "../index.ts";
import { fake, withFakeDocument } from "../../testing/index.ts";
import { hostStatus } from "./host-status.ts";
import { messageTransport, TEST_MESSAGES, type TestMessage } from "./message-transport.ts";

const opener: ChatOpenControlFactory = () => ({ element: document.createElement("a"), observe: () => undefined });
const tick = () => new Promise<void>((resolve) => { setTimeout(resolve, 0); });

function heldReads() {
  const sends: TestMessage[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const request = async <T>(message: TestMessage): Promise<ChatResult<T>> => {
    if (message.type === TEST_MESSAGES.panelConversationRead) {
      await gate;
      return { ok: true, value: { payload: { conversations: [] } } as T };
    }
    if (message.type === TEST_MESSAGES.panelConversationSend) {
      sends.push(message);
      return { ok: true, value: { payload: { conversation: { conversationId: "conversation.new" } } } as T };
    }
    return { ok: true, value: { payload: {} } as T };
  };
  return { sends, release, request };
}

test("a project named to the chat holds a send until its first read lands, as both clients open one", async () => {
  await withFakeDocument(async () => {
    const { sends, release, request } = heldReads();
    const chat = createChatWidget(messageTransport(request), { openControl: opener });
    chat.render(hostStatus({ connected: true, projectId: "project-1" }));
    chat.open({ kind: "project", projectId: "project-1" });
    await tick();
    const root = fake(chat.element);
    const box = root.descendants().find((node) => node.id === "conversationInput")!;
    assert.equal(box.disabled, false, "the box takes words at once");
    box.value = "Find the kettles";
    box.dispatch("input");
    box.dispatch("keydown", { key: "Enter", preventDefault: () => undefined });
    await tick();
    assert.deepEqual(sends, [], "nothing goes before the thread is ready");
    assert.equal(box.value, "Find the kettles");
    assert.equal(root.byClass("composer-held")[0]!.hidden, false);

    release();
    await tick();
    await tick();
    assert.equal(sends.length, 1, "it went when the read landed");
    assert.equal((sends[0] as { text?: unknown }).text, "Find the kettles");
    assert.equal(box.value, "");
    assert.equal(root.byClass("composer-held")[0]!.hidden, true);
  });
});

test("the extension's chat, following its host's project, takes and sends words during the first read, as it always has", async () => {
  await withFakeDocument(async () => {
    const { sends, release, request } = heldReads();
    const chat = createChatWidget(messageTransport(request), { openControl: opener });
    chat.render(hostStatus({ connected: true, projectId: "project-1" }));
    await tick();
    const root = fake(chat.element);
    const box = root.descendants().find((node) => node.id === "conversationInput")!;
    assert.equal(box.disabled, false);
    box.value = "Find the kettles";
    box.dispatch("input");
    box.dispatch("keydown", { key: "Enter", preventDefault: () => undefined });
    await tick();
    assert.equal(sends.length, 1);
    assert.equal(root.byClass("composer-held")[0]!.hidden, true);
    release();
    await tick();
    assert.equal(sends.length, 1);
  });
});
