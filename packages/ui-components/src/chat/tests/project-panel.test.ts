import assert from "node:assert/strict";
import { test } from "vitest";
import { createChatWidget } from "../chat-widget.ts";
import { CHAT_PROJECT_NAVIGATION } from "../project-navigation/index.ts";
import { targetCore } from "../conversation/tests/target-core.ts";
import { fake, withFakeDocument } from "../../testing/index.ts";
import { hostStatus } from "./host-status.ts";
import { messageTransport, TEST_MESSAGES, type TestMessage } from "./message-transport.ts";
import type { ChatOpenControlFactory, ChatResult } from "../ports/index.ts";

const opener: ChatOpenControlFactory = () => ({ element: document.createElement("a"), observe: () => undefined });

test("rendered project readiness waits for authorized empty list and never comes from old session", async () => {
  await withFakeDocument(async () => {
    const core = targetCore([{ conversationId: "old-thread", subjectKind: "project", subjectId: "project-1", turns: [{ turnId: "old", author: "person", text: "old task" }] }]);
    let release!: () => void;
    const empty = new Promise<void>(resolve => { release = resolve; });
    const request = async <T>(message: TestMessage): Promise<ChatResult<T>> => {
      if (message.type === TEST_MESSAGES.panelConversationRead && message.kind === "list" && message.projectId === "new") {
        await empty;
        return { ok: true, value: { payload: { conversations: [] } } as T };
      }
      return core.request<T>(message);
    };
    const chat = createChatWidget(messageTransport(request), { openControl: opener });
    chat.render(hostStatus({ connected: true, projectId: "project-1" }));
    await new Promise(resolve => setTimeout(resolve, 0));
    chat.open({ kind: "project", projectId: "new" });
    const root = fake(chat.element);
    assert.equal(root.getAttribute(CHAT_PROJECT_NAVIGATION.projectAttribute), "new");
    assert.equal(root.getAttribute(CHAT_PROJECT_NAVIGATION.scopeStateAttribute), "loading");
    assert.equal(root.descendants().find(node => node.id === "conversationInput")!.disabled, true);
    assert.equal(root.byClass("chat-msg").some(message => message.textContent.includes("old task")), false);
    release();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(root.getAttribute(CHAT_PROJECT_NAVIGATION.scopeStateAttribute), "ready");
    assert.equal(root.getAttribute(CHAT_PROJECT_NAVIGATION.projectAttribute), "new");
    assert.equal(root.descendants().find(node => node.id === "conversationInput")!.disabled, false);
    chat.render(hostStatus({ connected: false, projectId: "project-1" }));
    assert.equal(root.getAttribute(CHAT_PROJECT_NAVIGATION.scopeStateAttribute), "error");
  });
});

test("question navigation and Latest-chat back inherit scope while explicit different project wins", async () => {
  await withFakeDocument(async () => {
    const requests: TestMessage[] = [];
    const request = async <T>(message: TestMessage): Promise<ChatResult<T>> => {
      requests.push(message);
      return { ok: true, value: { payload: { conversations: [] } } as T };
    };
    const chat = createChatWidget(messageTransport(request), { openControl: opener });
    chat.render(hostStatus({ connected: true }));
    chat.open({ kind: "project", projectId: "new" });
    await new Promise(resolve => setTimeout(resolve, 0));
    chat.open({ kind: "question", activityId: "ask-work", subjectKind: "flow", subjectId: "new-flow", title: "Question" });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(chat.target().projectId, "new");
    assert.ok(requests.some(message => message.type === TEST_MESSAGES.panelConversationRead && message.subjectId === "new-flow" && message.projectId === "new"));
    const root = fake(chat.element);
    root.byClass("chat-context-back")[0]!.dispatch("click");
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(chat.target(), { kind: "latest", projectId: "new" });
    chat.open({ kind: "question", projectId: "other", activityId: "other-work", subjectKind: "run", subjectId: "other-run", title: "Other question" });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(chat.target().projectId, "other");
    root.byClass("chat-context-back")[0]!.dispatch("click");
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(chat.target(), { kind: "latest", projectId: "other" });
  });
});

test("project switch preserves and parks foreign draft without automatic adoption", async () => {
  const before = Object.getOwnPropertyDescriptor(globalThis, "localStorage"), values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } });
  try {
    await withFakeDocument(async () => {
      const request = async <T>(): Promise<ChatResult<T>> => ({ ok: true, value: { payload: { conversations: [] } } as T });
      const chat = createChatWidget(messageTransport(request), { openControl: opener });
      chat.render(hostStatus({ connected: true, projectId: "old" }));
      await new Promise(resolve => setTimeout(resolve, 0));
      const root = fake(chat.element), box = root.descendants().find(node => node.id === "conversationInput")!;
      box.value = "preserve unsent old draft";
      box.dispatch("input");
      chat.open({ kind: "project", projectId: "new" });
      await new Promise(resolve => setTimeout(resolve, 0));
      assert.equal(box.value, "preserve unsent old draft");
      assert.equal((box as unknown as { readOnly: boolean }).readOnly, true);
      assert.equal(root.descendants().find(node => node.id === "conversationSendButton")!.disabled, true);
      assert.ok([...values.values()].some(value => value.includes("preserve unsent old draft")));
      assert.equal(root.getAttribute(CHAT_PROJECT_NAVIGATION.scopeStateAttribute), "ready", "readiness is honest, but driver also checks parked composer");
    });
  } finally { if (before) Object.defineProperty(globalThis, "localStorage", before); else Reflect.deleteProperty(globalThis, "localStorage"); }
});
