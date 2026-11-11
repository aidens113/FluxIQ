// The chat with a list of threads, end to end under a fake DOM and a fake Core:
// which thread opens, what the person's pick and the host's targets keep, how a
// thread is read and written to, the project-less chat, the change feed, the
// background, the heading, the conversation list's New chat, Rename, Delete and
// layouts, and the words a host can replace.

import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { createChatWidget, type ChatWidget, type ChatWidgetOptions } from "../chat-widget.ts";
import type { ChatThreadsOptions, ChatTransport } from "../ports/index.ts";
import { fake, withFakeDocument, type FakeElement } from "../../testing/index.ts";
import { hostStatus } from "./host-status.ts";
import { thread, threadsCore, type CoreThread, type ThreadsCore } from "./threads-core.ts";

const REASON = "Open a project to start a conversation.";
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);

afterEach(() => {
  vi.useRealTimers();
});

function threeThreads(): CoreThread[] {
  return [
    thread("A", { title: "Alpha", updatedAt: 1000 }),
    thread("B", { title: "Bravo", updatedAt: 500, pendingAskCount: 1 }),
    thread("C", { title: "Charlie", updatedAt: 2000 })
  ];
}

type Heard = { selected: string[]; unanswered: number[]; titles: string[] };

function hear(extra: Partial<ChatThreadsOptions> = {}): { heard: Heard; threads: ChatThreadsOptions } {
  const heard: Heard = { selected: [], unanswered: [], titles: [] };
  const threads: ChatThreadsOptions = {
    unavailableReason: REASON,
    onSelected: (id) => heard.selected.push(id),
    onUnanswered: (count) => heard.unanswered.push(count),
    ...extra
  };
  return { heard, threads };
}

type Mounted = { chat: ChatWidget; root: FakeElement };

/** Mounts the chat on `transport`, connected and active, runs `body`, and stops it. */
async function mounted(transport: ChatTransport, options: ChatWidgetOptions, status: Parameters<typeof hostStatus>[0], body: (chat: ChatWidget, root: FakeElement) => Promise<void>): Promise<void> {
  await withFakeDocument(async () => {
    const chat = createChatWidget(transport, options);
    chat.render(hostStatus({ connected: true, ...status }));
    chat.setActive(true);
    try {
      await body(chat, fake(chat.element));
    } finally {
      chat.setActive(false);
    }
  });
}

/** The id of the thread on screen, when a thread is chosen. */
function openThread(chat: ChatWidget): string | undefined {
  const target = chat.target();
  return target.kind === "thread" ? target.conversationId : undefined;
}

function words(root: FakeElement): string[] {
  return root.byClass("chat-msg").map((message) => message.textContent);
}

function rowNames(root: FakeElement): string[] {
  return root.byClass("chat-thread-name").map((name) => name.textContent);
}

function row(root: FakeElement, conversationId: string): FakeElement {
  return root.byClass("chat-thread-row").find((candidate) => candidate.getAttribute("data-conversation-id") === conversationId)!;
}

function press(root: FakeElement, conversationId: string, className: string): void {
  row(root, conversationId).byClass(className)[0]!.dispatch("click");
}

function box(root: FakeElement): FakeElement {
  return root.descendants().find((element) => element.id === "conversationInput")!;
}

function send(root: FakeElement, text: string): void {
  const input = box(root);
  input.value = text;
  input.dispatch("input");
  input.dispatch("keydown", { key: "Enter", shiftKey: false, isComposing: false, keyCode: 13, preventDefault: () => undefined });
}

test("the chat opens the thread waiting on the person, lists the others in order, and counts what waits", async () => {
  const core = threadsCore(threeThreads());
  const { heard, threads } = hear({ onTitle: (title) => heard.titles.push(title) });
  await mounted(core.transport(), { threads }, {}, async (chat, root) => {
    await settle();
    assert.deepEqual(chat.target(), { kind: "thread", conversationId: "B", projectId: "project-1" });
    assert.deepEqual(rowNames(root), ["Bravo", "Charlie", "Alpha"]);
    assert.deepEqual(root.byClass("chat-thread-waiting").map((mark) => mark.hidden), [false, true, true], "Bravo is marked as waiting on the person");
    assert.equal(row(root, "B").getAttribute("data-selected"), "true");
    assert.deepEqual(words(root), ["B turn 1"]);
    assert.deepEqual(heard.selected, ["B"]);
    assert.deepEqual(heard.unanswered, [1]);
    assert.equal(heard.titles.at(-1), "Bravo");
    assert.equal(root.byClass("chat-thread-toggle")[0]!.textContent.startsWith("Chats"), true);
    assert.equal(root.byClass("chat-thread-badge")[0]!.textContent, "1 waiting");
    assert.equal(root.byClass("chat-thread-title")[0]!.hidden, true, "a host that takes the name gets no name drawn");
    assert.equal(root.byClass("chat-context")[0]!.hidden, true, "a chosen thread has no automation line");
  });
});

test("with no waiting thread the newest opens, and a restored thread opens when listed", async () => {
  const quiet = (): CoreThread[] => threeThreads().map((candidate) => ({ ...candidate, pendingAskCount: 0 }));
  await mounted(threadsCore(quiet()).transport(), { threads: hear().threads }, {}, async (chat) => {
    await settle();
    assert.equal(openThread(chat), "C");
  });
  const restored = hear({ initialConversationId: "A" });
  await mounted(threadsCore(threeThreads()).transport(), { threads: restored.threads }, {}, async (chat) => {
    await settle();
    assert.equal(openThread(chat), "A");
    assert.deepEqual(restored.heard.selected, ["A"]);
  });
  await mounted(threadsCore(threeThreads()).transport(), { threads: hear({ initialConversationId: "gone" }).threads }, {}, async (chat) => {
    await settle();
    assert.equal(openThread(chat), "B", "a thread no longer listed is ignored");
  });
});

test("a person's pick stays when the list moves, and the host hears it", async () => {
  vi.useFakeTimers();
  const core = threadsCore(threeThreads());
  const { heard, threads } = hear();
  await mounted(core.transport({ changes: true }), { threads }, {}, async (chat, root) => {
    await tick(0);
    press(root, "A", "chat-thread-open");
    await tick(0);
    assert.deepEqual(chat.target(), { kind: "thread", conversationId: "A", projectId: "project-1" });
    assert.deepEqual(words(root), ["A turn 1"]);
    core.threads[2]!.pendingAskCount = 2;
    core.emit();
    await tick(300);
    assert.equal(openThread(chat), "A", "the first thread of the list is now C, and the pick stays");
    assert.deepEqual(heard.selected, ["B", "A"]);
    assert.equal(row(root, "A").getAttribute("data-selected"), "true");
    assert.deepEqual(heard.unanswered, [1, 2]);
  });
});

test("an owner change forgets the selection and the count the host heard", async () => {
  const core = threadsCore([...threeThreads(), thread("P2", { projectId: "project-2", title: "Other project", updatedAt: 10 })]);
  const { heard, threads } = hear();
  await withFakeDocument(async () => {
    const chat = createChatWidget(core.transport(), { threads });
    chat.render(hostStatus({ connected: true, projectId: "project-1" }));
    chat.setActive(true);
    try {
      await settle();
      assert.equal(openThread(chat), "B");
      chat.render(hostStatus({ connected: true, projectId: "project-2" }));
      assert.deepEqual(chat.target(), { kind: "latest", projectId: "project-2" }, "nothing of the last owner stays");
      await settle();
      assert.deepEqual(chat.target(), { kind: "thread", conversationId: "P2", projectId: "project-2" });
      assert.deepEqual(core.calls.listAll.map((query) => query.projectId), ["project-1", "project-2"]);
      assert.deepEqual(heard.selected, ["B", "P2"]);
      assert.deepEqual(heard.unanswered, [1, 0], "the new owner hears its own count, whatever the last was");
    } finally {
      chat.setActive(false);
    }
  });
});

test("an automation's chat and a question's chat are not taken by the list, and the way back gives a thread", async () => {
  vi.useFakeTimers();
  const core = threadsCore(threeThreads());
  const automation = { kind: "automation", flowId: "flow-7", name: "Price tracker", projectId: "project-1" } as const;
  const question = { kind: "question", activityId: "run:r1", subjectKind: "run", subjectId: "r1", title: "The run's question", projectId: "project-1" } as const;
  await mounted(core.transport({ changes: true }), { threads: hear().threads }, { projectId: "project-1" }, async (chat) => {
    await tick(0);
    for (const target of [automation, question]) {
      chat.open(target);
      core.emit();
      await tick(300);
      assert.deepEqual(chat.target(), target);
    }
    chat.open({ kind: "latest" });
    assert.equal(openThread(chat), "B", "latest gives way to the list's first thread at once");
  });
});

test("a chosen thread is read directly with its own project and written to with it, whatever project is open", async () => {
  const core = threadsCore([thread("far", { projectId: "project-9", title: "Far away", updatedAt: 5 })]);
  await mounted(core.transport(), { threads: hear().threads }, {}, async (chat, root) => {
    await settle();
    assert.deepEqual(core.calls.list, [], "no thread is found by listing");
    assert.ok(core.calls.read.length > 0);
    assert.ok(core.calls.read.every((query) => query.projectId === "project-9" && query.conversationId === "far"));
    send(root, "Hello there");
    await settle();
    assert.equal(core.calls.send.length, 1);
    assert.equal(core.calls.send[0]!.conversationId, "far");
    assert.equal(core.calls.send[0]!.projectId, "project-9");
    assert.deepEqual(words(root), ["far turn 1", "Hello there"]);
    assert.deepEqual(core.calls.list, []);
  });
});

test("a chat with no project and no thread is empty, says why it cannot send, and starts working when a thread is listed", async () => {
  vi.useFakeTimers();
  const core = threadsCore([]);
  const { threads } = hear();
  await mounted(core.transport({ changes: true }), { threads, welcome: { title: "Welcome", line: "Hello.", items: [] } }, {}, async (chat, root) => {
    await tick(0);
    assert.deepEqual(core.calls.list, [], "nothing is listed with no project to list in");
    assert.deepEqual(core.calls.read, []);
    const reason = root.byClass("composer-unavailable")[0]!;
    assert.equal(reason.hidden, false);
    assert.equal(reason.textContent, REASON);
    assert.equal(box(root).disabled, true);
    assert.equal(root.byClass("chat-empty")[0]!.hidden, false);
    assert.equal(root.byClass("chat-empty-title")[0]!.textContent, "Welcome");
    core.threads.push(thread("late", { title: "Late", updatedAt: 9 }));
    core.emit();
    await tick(300);
    assert.equal(openThread(chat), "late");
    assert.equal(reason.hidden, true, "the reason lifts the moment a thread is listed");
    assert.equal(box(root).disabled, false);
    assert.deepEqual(words(root), ["late turn 1"]);
  });
});

test("before the first read the project-less chat is loading, not empty", async () => {
  const core = threadsCore([]);
  let release: (() => void) | undefined;
  const transport = core.transport();
  const held: ChatTransport = {
    ...transport,
    conversation: {
      ...transport.conversation,
      listAllThreads: async (query) => {
        await new Promise<void>((resolve) => (release = resolve));
        return transport.conversation.listAllThreads!(query);
      }
    }
  };
  await mounted(held, { threads: hear().threads, welcome: { title: "Welcome", line: "Hello.", items: [] } }, {}, async (_chat, root) => {
    await settle();
    assert.equal(root.byClass("chat-empty-title")[0]!.textContent, "", "loading says no title");
    assert.equal(root.byClass("chat-empty-line")[0]!.textContent, "Loading the conversation...");
    release?.();
    await settle();
    assert.equal(root.byClass("chat-empty-title")[0]!.textContent, "Welcome");
  });
});

test("a host whose transport finds the session's project gives no reason: the project-less latest chat reads, takes typing and sends", async () => {
  // A browser extension's background names the session's project for a message that names none, asking Core
  // for one when the browser has none stored, so a person who has no thread and no project yet can still write.
  const core = threadsCore([]);
  const { threads } = hear();
  delete (threads as { unavailableReason?: string }).unavailableReason;
  await mounted(core.transport(), { threads }, {}, async (chat, root) => {
    await settle();
    assert.deepEqual(chat.target(), { kind: "latest" });
    assert.ok(core.calls.list.length > 0, "the latest chat is listed as without a thread list, the transport naming the project");
    assert.ok(core.calls.list.every((query) => query.projectId === undefined));
    assert.equal(root.byClass("composer-unavailable")[0]!.hidden, true);
    assert.equal(box(root).disabled, false);
    assert.equal(box(root).placeholder, "Message FluxIQ");
    send(root, "Hello from a new browser");
    await settle();
    await settle();
    assert.equal(core.calls.send.length, 1);
    assert.equal(core.calls.send[0]!.projectId, undefined, "the transport names the project, not the chat");
    assert.deepEqual(words(root), ["Hello from a new browser"]);
  });
});

test("the change feed schedules a read of the thread and the list, and is let go on stop and on owner change", async () => {
  vi.useFakeTimers();
  const core = threadsCore(threeThreads());
  await withFakeDocument(async () => {
    const chat = createChatWidget(core.transport({ changes: true }), { threads: hear().threads });
    chat.render(hostStatus({ connected: true, projectId: "project-1" }));
    chat.setActive(true);
    try {
      await tick(0);
      assert.equal(core.listening(), 1);
      const lists = core.calls.listAll.length;
      const reads = core.calls.read.length;
      core.emit({ conversationId: "B" });
      await tick(299);
      assert.equal(core.calls.listAll.length, lists, "the read waits for the debounce");
      await tick(1);
      assert.equal(core.calls.listAll.length, lists + 1);
      assert.ok(core.calls.read.length > reads, "the thread on screen is read too");
      chat.render(hostStatus({ connected: true, projectId: "project-2" }));
      assert.equal(core.listening(), 1, "the last owner's listener is gone and the new owner has one");
      chat.setActive(false);
      assert.equal(core.listening(), 0);
      const after = core.calls.listAll.length;
      core.emit();
      await tick(1000);
      assert.equal(core.calls.listAll.length, after, "a stopped chat reads nothing");
      chat.setActive(true);
      assert.equal(core.listening(), 1);
    } finally {
      chat.setActive(false);
    }
  });
});

test("the poll beat is 4 s alone and 10 s beside a change feed", async () => {
  vi.useFakeTimers();
  for (const [changes, expected] of [[false, 4000], [true, 10000]] as const) {
    const core = threadsCore(threeThreads());
    await mounted(core.transport({ changes }), { threads: hear().threads }, { projectId: "project-1" }, async () => {
      await tick(0);
      const first = core.calls.listAll.length;
      await tick(expected - 1);
      assert.equal(core.calls.listAll.length, first, `no read before ${expected} ms`);
      await tick(1);
      assert.equal(core.calls.listAll.length, first + 1, `a read at ${expected} ms`);
    });
  }
});

test("in the background only the thread list is read, on a 5 s beat, hidden tab or not; coming forward reads everything at once", async () => {
  vi.useFakeTimers();
  const core = threadsCore(threeThreads());
  const { heard, threads } = hear();
  await withFakeDocument(async () => {
    const chat = createChatWidget(core.transport({ changes: true }), { threads });
    chat.setBackground(true);
    chat.render(hostStatus({ connected: true, projectId: "project-1" }));
    chat.setActive(true);
    const root = fake(chat.element);
    try {
      await tick(0);
      assert.equal(core.calls.listAll.length, 1);
      assert.deepEqual(heard.unanswered, [1], "the badge can light while the chat is out of sight");
      assert.deepEqual(core.calls.list, []);
      assert.deepEqual(core.calls.read, [], "no thread is read");
      (globalThis as { document: { visibilityState: string } }).document.visibilityState = "hidden";
      await tick(5000);
      assert.equal(core.calls.listAll.length, 2);
      await tick(5000);
      assert.equal(core.calls.listAll.length, 3);
      core.emit();
      await tick(300);
      assert.equal(core.calls.listAll.length, 4, "a change reads the list");
      assert.deepEqual(core.calls.read, [], "and still no thread");
      (globalThis as { document: { visibilityState: string } }).document.visibilityState = "visible";
      chat.setBackground(false);
      await tick(0);
      assert.ok(core.calls.read.length > 0, "forward, the thread on screen is read at once");
      assert.deepEqual(words(root), ["B turn 1"]);
    } finally {
      chat.setActive(false);
    }
  });
});

test("a long thread keeps its newest window, says how many are earlier, and shows them all on request", async () => {
  const core = threadsCore([thread("long", {}, 30), thread("barely", {}, 6)]);
  await mounted(core.transport(), { history: { window: 5 } }, {}, async (chat, root) => {
    chat.open({ kind: "thread", conversationId: "long", projectId: "project-1" });
    await settle();
    assert.deepEqual(words(root), [26, 27, 28, 29, 30].map((n) => `long turn ${n}`));
    const control = root.byClass("chat-earlier")[0]!;
    assert.equal(control.hidden, false);
    assert.equal(control.textContent, "Show 25 earlier turns");
    chat.open({ kind: "thread", conversationId: "barely", projectId: "project-1" });
    await settle();
    assert.equal(control.textContent, "Show 1 earlier turn");
    chat.open({ kind: "thread", conversationId: "long", projectId: "project-1" });
    await settle();
    root.byClass("chat-earlier-button")[0]!.dispatch("click");
    await settle();
    assert.equal(words(root).length, 30);
    assert.equal(words(root)[0], "long turn 1");
    assert.equal(control.hidden, true);
    chat.showEarlier();
    await settle();
    assert.equal(words(root).length, 30, "asking again changes nothing");
  });
});

test("without a history option the window is as it was, with no control", async () => {
  const core = threadsCore([thread("long", {}, 30)]);
  await mounted(core.transport(), {}, {}, async (chat, root) => {
    chat.open({ kind: "thread", conversationId: "long", projectId: "project-1" });
    await settle();
    assert.equal(words(root).length, 20);
    assert.equal(root.byClass("chat-earlier").length, 0);
  });
});

test("the heading is a title in words with one thread and no host title bar, never an id", async () => {
  const core = threadsCore([thread("conv-secret-id-1", { subjectKind: "project", title: null })]);
  await mounted(core.transport(), { threads: hear().threads }, { projectName: "Company website" }, async (_chat, root) => {
    await settle();
    const title = root.byClass("chat-thread-title")[0]!;
    assert.equal(title.hidden, false);
    assert.equal(title.textContent, "Company website");
    assert.equal(root.byClass("chat-thread-header")[0]!.textContent.includes("conv-secret-id-1"), false);
    assert.equal(root.byClass("chat-thread-row")[0]!.textContent.includes("conv-secret-id-1"), false);
    assert.equal(root.descendants().some((element) => element.tagName === "BUTTON" && element.textContent === "Refresh"), false, "no Refresh control");
  });
});

test("a host that takes the chat's name hears it, and the header holds only the Chats button", async () => {
  const core = threadsCore([thread("only", { title: "Nightly run" })]);
  const titles: string[] = [];
  await mounted(core.transport(), { threads: hear({ onTitle: (title) => titles.push(title) }).threads }, {}, async (_chat, root) => {
    await settle();
    assert.equal(titles.at(-1), "Nightly run");
    assert.equal(root.byClass("chat-thread-header")[0]!.hidden, false);
    assert.equal(root.byClass("chat-thread-title")[0]!.hidden, true);
    assert.equal(root.byClass("chat-thread-toggle-label")[0]!.textContent, "Chats");
  });
});

test("a welcome replaces the onboarding, and a fallback replaces its words", async () => {
  const core = threadsCore([]);
  const welcome = {
    title: "This is where FluxIQ talks to you",
    line: "You can write here too.",
    items: [
      { icon: "key-round", title: "Permission before anything lasting", body: "FluxIQ stops here and asks." },
      { icon: "split", title: "A decision only you can make", body: "It shows both here." },
      { icon: "pen-line", title: "What it did", body: "Progress while it works." }
    ]
  };
  await mounted(core.transport(), { welcome, onExtract: () => undefined }, { projectId: "project-1" }, async (_chat, root) => {
    await settle();
    assert.equal(root.byClass("chat-empty-title")[0]!.textContent, welcome.title);
    assert.equal(root.byClass("chat-empty-line")[0]!.textContent, welcome.line);
    assert.equal(root.byClass("chat-start").length, 0, "no starts");
    assert.equal(root.byClass("chat-example").length, 0, "no examples about the page");
    assert.equal(root.byClass("chat-welcome-item").length, 3);
    assert.deepEqual(root.byClass("chat-welcome-item").map((item) => item.descendants()[0]!.getAttribute("data-icon")), ["key-round", "split", "pen-line"]);
    assert.ok(!root.textContent.includes("turns a job you describe"), "the concept is not said");
  });
  const unsupported = core.transport();
  const refusing: ChatTransport = {
    ...unsupported,
    conversation: { ...unsupported.conversation, listThreads: async () => ({ ok: false, sentence: "No.", unsupported: true }) }
  };
  await mounted(refusing, { fallback: { title: "Open FluxIQ", line: "The conversation lives in the app." } }, { projectId: "project-1" }, async (_chat, root) => {
    await settle();
    const fallback = root.byClass("chat-fallback")[0]!;
    assert.equal(fallback.hidden, false);
    assert.equal(fallback.byClass("chat-empty-title")[0]!.textContent, "Open FluxIQ");
    assert.equal(fallback.byClass("chat-empty-line")[0]!.textContent, "The conversation lives in the app.");
  });
  await mounted(refusing, {}, { projectId: "project-1" }, async (_chat, root) => {
    await settle();
    assert.equal(root.byClass("chat-fallback")[0]!.byClass("chat-empty-title")[0]!.textContent, "Talk to FluxIQ in the FluxIQ window.");
  });
});

test("without the port the thread list needs, the option does nothing", async () => {
  const core: ThreadsCore = threadsCore(threeThreads());
  await mounted(core.transport({ listAll: false }), { threads: hear().threads }, { projectId: "project-1" }, async (chat, root) => {
    await settle();
    assert.equal(root.byClass("chat-thread-header").length, 0);
    assert.equal(chat.target().kind, "latest");
    assert.deepEqual(core.calls.listAll, []);
  });
});

test("New chat, Rename and Delete are offered only when the port carries them", async () => {
  const core = threadsCore(threeThreads());
  await mounted(core.transport(), { threads: hear().threads }, { projectId: "project-1" }, async (_chat, root) => {
    await settle();
    assert.equal(root.byClass("chat-thread-new")[0]!.hidden, true);
    assert.ok(root.byClass("chat-thread-rename").every((button) => button.hidden));
    assert.ok(root.byClass("chat-thread-delete").every((button) => button.hidden));
    assert.ok(root.byClass("chat-thread-actions").every((actions) => actions.hidden), "no empty strip of actions");
    assert.equal(root.byClass("chat-thread-search")[0]!.hidden, false, "search needs nothing of the port");
  });
  await mounted(core.transport({ actions: true }), { threads: hear().threads }, { projectId: "project-1" }, async (_chat, root) => {
    await settle();
    assert.equal(root.byClass("chat-thread-new")[0]!.hidden, false);
    assert.ok(root.byClass("chat-thread-rename").every((button) => !button.hidden));
    assert.ok(root.byClass("chat-thread-delete").every((button) => !button.hidden));
    assert.equal(row(root, "A").byClass("chat-thread-delete")[0]!.getAttribute("aria-label"), "Delete Alpha");
  });
});

test("New chat asks Core for a fresh thread about the host's project, opens it, closes the drawer and lists it", async () => {
  const core = threadsCore(threeThreads());
  await mounted(core.transport({ actions: true }), { threads: hear().threads }, { projectId: "project-1" }, async (chat, root) => {
    await settle();
    const toggle = root.byClass("chat-thread-toggle")[0]!;
    const nav = root.byClass("chat-thread-nav")[0]!;
    assert.equal(nav.hidden, true, "the drawer starts closed");
    assert.equal(toggle.getAttribute("aria-controls"), nav.id);
    toggle.dispatch("click");
    assert.equal(nav.hidden, false);
    assert.equal(toggle.getAttribute("aria-expanded"), "true");
    const lists = core.calls.listAll.length;
    root.byClass("chat-thread-new")[0]!.dispatch("click");
    await settle();
    await settle();
    assert.deepEqual(core.calls.newThread, [{ projectId: "project-1", subjectKind: "project" }]);
    assert.deepEqual(chat.target(), { kind: "thread", conversationId: "conv-new-4", projectId: "project-1" });
    assert.equal(nav.hidden, true, "the new chat takes the drawer's place");
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    assert.ok(core.calls.listAll.length > lists, "the list is read again");
    assert.deepEqual(rowNames(root), ["Bravo", "This project", "Charlie", "Alpha"]);
    assert.equal(row(root, "conv-new-4").getAttribute("data-selected"), "true");
  });
  const panel = threadsCore([]);
  await mounted(panel.transport({ actions: true }), { threads: hear().threads }, {}, async (_chat, root) => {
    await settle();
    root.byClass("chat-thread-new")[0]!.dispatch("click");
    await settle();
    assert.deepEqual(panel.calls.newThread, [{ subjectKind: "panel" }], "with no project open, a new chat is about the panel");
  });
});

test("Rename edits the name in place: Enter saves it through the port, Escape sends nothing", async () => {
  const core = threadsCore(threeThreads());
  await mounted(core.transport({ actions: true }), { threads: hear().threads }, { projectId: "project-1" }, async (_chat, root) => {
    await settle();
    press(root, "C", "chat-thread-rename");
    const input = row(root, "C").byClass("chat-thread-rename-input")[0]!;
    assert.equal(input.hidden, false);
    assert.equal(input.value, "Charlie");
    assert.equal(row(root, "C").byClass("chat-thread-open")[0]!.hidden, true);
    input.value = "Something else";
    input.dispatch("keydown", { key: "Escape", preventDefault: () => undefined });
    assert.equal(input.hidden, true);
    assert.deepEqual(core.calls.rename, [], "Escape cancels");
    press(root, "C", "chat-thread-rename");
    assert.equal(input.value, "Charlie", "a new edit starts from the name");
    input.value = "  Weekly prices  ";
    input.dispatch("keydown", { key: "Enter", preventDefault: () => undefined });
    await settle();
    await settle();
    assert.deepEqual(core.calls.rename, [{ conversationId: "C", title: "Weekly prices", projectId: "project-1" }]);
    assert.deepEqual(rowNames(root), ["Bravo", "Weekly prices", "Alpha"]);
  });
});

test("Delete asks in place; deleting the open thread opens the next one, and the last one leaves the empty chat", async () => {
  const core = threadsCore([thread("A", { title: "Alpha", updatedAt: 1000 }), thread("C", { title: "Charlie", updatedAt: 2000 })]);
  const { heard, threads } = hear();
  await mounted(core.transport({ actions: true }), { threads }, { projectId: "project-1" }, async (chat, root) => {
    await settle();
    assert.equal(openThread(chat), "C");
    press(root, "C", "chat-thread-delete");
    const confirm = row(root, "C").byClass("chat-thread-confirm")[0]!;
    assert.equal(confirm.hidden, false);
    assert.equal(confirm.byClass("chat-thread-confirm-text")[0]!.textContent, "Delete this chat?");
    assert.deepEqual(core.calls.remove, [], "nothing is deleted before the person confirms");
    press(root, "C", "chat-thread-confirm-cancel");
    assert.equal(confirm.hidden, true);
    press(root, "C", "chat-thread-delete");
    press(root, "C", "chat-thread-confirm-delete");
    await settle();
    await settle();
    assert.deepEqual(core.calls.remove, [{ conversationId: "C", projectId: "project-1" }]);
    assert.equal(openThread(chat), "A", "the next thread of the list opens");
    assert.deepEqual(rowNames(root), ["Alpha"]);
    assert.deepEqual(heard.selected, ["C", "A"]);
    press(root, "A", "chat-thread-delete");
    press(root, "A", "chat-thread-confirm-delete");
    await settle();
    await settle();
    assert.deepEqual(chat.target(), { kind: "latest", projectId: "project-1" }, "nothing is left: the latest chat");
    assert.deepEqual(rowNames(root), []);
    assert.equal(root.byClass("chat-thread-none")[0]!.textContent, "No chats yet.");
    assert.equal(root.byClass("chat-empty")[0]!.hidden, false, "the empty chat");
  });
});

test("deleting a thread that is not on screen leaves the thread on screen alone", async () => {
  const core = threadsCore(threeThreads());
  await mounted(core.transport({ actions: true }), { threads: hear().threads }, { projectId: "project-1" }, async (chat, root) => {
    await settle();
    assert.equal(openThread(chat), "B");
    press(root, "A", "chat-thread-delete");
    press(root, "A", "chat-thread-confirm-delete");
    await settle();
    await settle();
    assert.equal(openThread(chat), "B");
    assert.deepEqual(rowNames(root), ["Bravo", "Charlie"]);
  });
});

test("a refused delete shows Core's sentence, keeps the thread, and the next press clears it", async () => {
  const core = threadsCore(threeThreads());
  const sentence = "This chat's work is still running. Stop it before deleting the chat.";
  core.deleteFails = { ok: false, sentence, code: "conversation_run_active" };
  await mounted(core.transport({ actions: true }), { threads: hear().threads }, { projectId: "project-1" }, async (chat, root) => {
    await settle();
    press(root, "B", "chat-thread-delete");
    press(root, "B", "chat-thread-confirm-delete");
    await settle();
    await settle();
    const notice = root.byClass("chat-thread-notice")[0]!;
    assert.equal(notice.hidden, false);
    assert.equal(notice.textContent, sentence);
    assert.equal(notice.getAttribute("role"), "alert");
    assert.equal(openThread(chat), "B");
    assert.deepEqual(rowNames(root), ["Bravo", "Charlie", "Alpha"]);
    core.deleteFails = undefined;
    press(root, "A", "chat-thread-delete");
    press(root, "A", "chat-thread-confirm-delete");
    await settle();
    assert.equal(notice.hidden, true);
  });
});

test("the drawer closes on Escape and on a pick; a column keeps the list beside the thread", async () => {
  const core = threadsCore(threeThreads());
  await mounted(core.transport(), { threads: hear().threads }, { projectId: "project-1" }, async (chat, root) => {
    await settle();
    assert.equal(root.getAttribute("data-thread-layout"), "drawer");
    const toggle = root.byClass("chat-thread-toggle")[0]!;
    const nav = root.byClass("chat-thread-nav")[0]!;
    toggle.dispatch("click");
    nav.dispatch("keydown", { key: "Escape", preventDefault: () => undefined });
    assert.equal(nav.hidden, true);
    toggle.dispatch("click");
    press(root, "A", "chat-thread-open");
    assert.equal(nav.hidden, true);
    assert.equal(openThread(chat), "A");
  });
  await mounted(core.transport(), { threads: hear({ layout: "column" }).threads }, { projectId: "project-1" }, async (_chat, root) => {
    await settle();
    assert.equal(root.getAttribute("data-thread-layout"), "column");
    const nav = root.children[0]!;
    assert.equal(nav.className, "chat-thread-nav");
    assert.equal(nav.hidden, false);
    assert.equal(root.children[1]!.className, "chat-body");
    assert.equal(root.byClass("chat-thread-toggle").length, 0, "no Chats button beside an open list");
    assert.equal(root.byClass("chat-thread-header")[0]!.textContent, "Bravo");
    press(root, "A", "chat-thread-open");
    nav.dispatch("keydown", { key: "Escape", preventDefault: () => undefined });
    assert.equal(nav.hidden, false, "a column never closes");
  });
});
