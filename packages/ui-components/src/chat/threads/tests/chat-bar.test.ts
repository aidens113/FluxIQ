// The chat bar, the thread list following the host's project, and a host's own activity feed,
// end to end under a fake DOM and a fake Core.

import assert from "node:assert/strict";
import { test } from "vitest";
import { createChatWidget, type ChatWidget, type ChatWidgetOptions } from "../../chat-widget.ts";
import type { ChatActivitySource } from "../../feed/index.ts";
import type { ChatTransport } from "../../ports/index.ts";
import { fake, withFakeDocument, type FakeElement } from "../../../testing/index.ts";
import { hostStatus } from "../../tests/host-status.ts";
import { relayState } from "../../tests/activity-fixture.ts";
import { thread, threadsCore, type CoreThread } from "../../tests/threads-core.ts";

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const OWNER = "same-owner";

function inProject(projectId: string, fields: Partial<CoreThread> = {}, id = `${projectId}-chat`): CoreThread {
  return thread(id, { projectId, title: `${projectId} chat`, subjectKind: "project", ...fields });
}

async function mounted(transport: ChatTransport, options: ChatWidgetOptions, body: (chat: ChatWidget, root: FakeElement) => Promise<void>): Promise<void> {
  await withFakeDocument(async () => {
    const chat = createChatWidget(transport, options);
    chat.render(hostStatus({ connected: true, ownerKey: OWNER, projectId: "alpha" }));
    chat.setActive(true);
    try {
      await body(chat, fake(chat.element));
    } finally {
      chat.setActive(false);
    }
  });
}

test("the bar names the chat, has Chats with how many wait, and makes a new chat that opens", async () => {
  const core = threadsCore([inProject("alpha", { updatedAt: 500 }, "a1"), inProject("alpha", { title: "Quotes", updatedAt: 900, pendingAskCount: 1 }, "a2")]);
  await mounted(core.transport({ actions: true }), { threads: {} }, async (chat, root) => {
    await settle();
    const bar = root.byClass("chat-bar")[0]!;
    assert.equal(root.byClass("chat-bar-title-text")[0]!.textContent, "Quotes", "the chat waiting on the person is open");
    assert.equal(bar.byClass("chat-thread-toggle-label")[0]!.textContent, "Chats");
    assert.equal(bar.byClass("chat-thread-badge")[0]!.textContent, "1 waiting");
    assert.equal(bar.byClass("chat-thread-title")[0]!.hidden, true, "the name is said once");
    const fresh = bar.byClass("chat-bar-new")[0]!;
    assert.equal(fresh.hidden, false);
    assert.equal(fresh.textContent, "New chat");
    fresh.dispatch("click");
    await settle();
    assert.equal(core.calls.newThread.length, 1);
    assert.deepEqual(core.calls.newThread[0], { projectId: "alpha", subjectKind: "project" });
    assert.equal(chat.target().kind, "thread");
    assert.equal((chat.target() as { conversationId: string }).conversationId, "conv-new-3");
  });
});

test("one New chat control at a time: the bar's hides while the list, which has its own, is open", async () => {
  const core = threadsCore([inProject("alpha")]);
  await mounted(core.transport({ actions: true }), { threads: {} }, async (_chat, root) => {
    await settle();
    const fresh = root.byClass("chat-bar-new")[0]!;
    const toggle = root.byClass("chat-thread-toggle")[0]!;
    const nav = root.byClass("chat-thread-nav")[0]!;
    const visibleNew = () => root.byClass("chat-bar-new").filter((b) => !b.hidden).length + (nav.hidden ? 0 : root.byClass("chat-thread-new").filter((b) => !b.hidden).length);
    assert.equal(visibleNew(), 1, "closed: only the bar's");
    toggle.dispatch("click");
    assert.equal(fresh.hidden, true);
    assert.equal(visibleNew(), 1, "open: only the list's");
    toggle.dispatch("click");
    assert.equal(fresh.hidden, false);
    assert.equal(visibleNew(), 1);
  });
});

test("the title opens the drawer like the Chats button, and the list can be left again", async () => {
  const core = threadsCore([inProject("alpha")]);
  await mounted(core.transport({ actions: true }), { threads: {} }, async (_chat, root) => {
    await settle();
    const nav = root.byClass("chat-thread-nav")[0]!;
    const title = root.byClass("chat-bar-title")[0]!;
    const toggle = root.byClass("chat-thread-toggle")[0]!;
    assert.equal(nav.hidden, true);
    assert.equal(title.getAttribute("aria-controls"), nav.id);
    title.dispatch("click");
    assert.equal(nav.hidden, false);
    assert.equal(title.getAttribute("aria-expanded"), "true");
    assert.equal(toggle.getAttribute("aria-expanded"), "true");
    toggle.dispatch("click");
    assert.equal(nav.hidden, true);
  });
});

test("no New chat where the transport cannot make one, and no bar when the host turns it off", async () => {
  const core = threadsCore([inProject("alpha")]);
  await mounted(core.transport(), { threads: {} }, async (_chat, root) => {
    await settle();
    assert.equal(root.byClass("chat-bar-new")[0]!.hidden, true);
  });
  await mounted(core.transport({ actions: true }), { threads: {}, chatBar: false }, async (_chat, root) => {
    await settle();
    assert.equal(root.byClass("chat-bar").length, 0);
    assert.equal(root.byClass("chat-thread-toggle").length, 1, "the plain Chats button is still there");
  });
});

test("a different project under the same owner re-lists the chats and opens that project's latest", async () => {
  const core = threadsCore([
    inProject("alpha", { updatedAt: 100 }, "a1"),
    inProject("beta", { title: "Beta older", updatedAt: 100 }, "b1"),
    inProject("beta", { title: "Beta newest", updatedAt: 800 }, "b2")
  ]);
  await mounted(core.transport({ actions: true }), { threads: {} }, async (chat, root) => {
    await settle();
    assert.deepEqual(chat.target(), { kind: "thread", conversationId: "a1", projectId: "alpha" });
    const heard: string[] = [];
    chat.onTargetChange((target) => heard.push(target.kind));
    chat.render(hostStatus({ connected: true, ownerKey: OWNER, projectId: "beta" }));
    await settle();
    assert.deepEqual(core.calls.listAll.at(-1), { projectId: "beta", limit: 25 });
    assert.deepEqual(chat.target(), { kind: "thread", conversationId: "b2", projectId: "beta" });
    assert.equal(root.byClass("chat-bar-title-text")[0]!.textContent, "Beta newest");
    assert.deepEqual(root.byClass("chat-thread-name").map((name) => name.textContent).sort(), ["Beta newest", "Beta older"], "nothing of the last project is listed");
    assert.ok(heard.length > 0, "the host hears the chat move");
  });
});

test("a project with no chats shows an empty new chat for it, and a person's send goes to that project", async () => {
  const core = threadsCore([inProject("alpha")]);
  await mounted(core.transport({ actions: true }), { threads: {} }, async (chat, root) => {
    await settle();
    chat.render(hostStatus({ connected: true, ownerKey: OWNER, projectId: "gamma", projectName: "Gamma" }));
    await settle();
    assert.deepEqual(core.calls.listAll.at(-1), { projectId: "gamma", limit: 25 });
    assert.deepEqual(chat.target(), { kind: "latest", projectId: "gamma" });
    assert.deepEqual(root.byClass("chat-thread-name").map((name) => name.textContent), []);
    assert.equal(root.byClass("chat-bar-title-text")[0]!.textContent, "Gamma");
    const input = root.descendants().find((element) => element.id === "conversationInput")!;
    input.value = "Start here";
    input.dispatch("input");
    input.dispatch("keydown", { key: "Enter", shiftKey: false, isComposing: false, keyCode: 13, preventDefault: () => undefined });
    await settle();
    assert.equal(core.calls.send.at(-1)?.projectId, "gamma");
  });
});

test("an unchanged project does not reset the chat", async () => {
  const core = threadsCore([inProject("alpha", {}, "a1"), inProject("alpha", { updatedAt: 5 }, "a2")]);
  await mounted(core.transport({ actions: true }), { threads: {} }, async (chat) => {
    await settle();
    const reads = core.calls.listAll.length;
    chat.render(hostStatus({ connected: true, ownerKey: OWNER, projectId: "alpha", recording: true }));
    await settle();
    assert.equal(core.calls.listAll.length, reads);
  });
});

test("a host's own activity feed is heard and read, and the chat starts none of its own", async () => {
  const core = threadsCore([inProject("alpha")]);
  let ownReads = 0;
  let ownSubscribes = 0;
  const transport: ChatTransport = {
    ...core.transport({ actions: true }),
    activity: {
      read: async () => {
        ownReads += 1;
        return { ok: true, value: { state: relayState([]) } };
      },
      subscribe: () => {
        ownSubscribes += 1;
        return () => undefined;
      }
    }
  };
  const heard = new Set<() => void>();
  let reads = 0;
  const source: ChatActivitySource = {
    snapshot: () => ({ reach: "ready", state: relayState([]), overlaySaving: false }),
    read: async () => {
      reads += 1;
    },
    subscribe: (listener) => {
      heard.add(listener);
      return () => heard.delete(listener);
    }
  };
  await mounted(transport, { threads: {}, activity: source }, async (chat) => {
    await settle();
    assert.equal(reads, 1, "the host's feed is read when the chat starts");
    assert.equal(heard.size, 1, "and heard");
    assert.equal(ownReads, 0);
    assert.equal(ownSubscribes, 0);
    for (const listener of heard) listener();
    chat.setActive(false);
    assert.equal(heard.size, 0, "the chat stops hearing it when it stops");
  });
  assert.equal(ownReads, 0);
  assert.equal(ownSubscribes, 0);
});
