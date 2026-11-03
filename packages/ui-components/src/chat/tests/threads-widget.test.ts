// The chat with a list of threads, end to end under a fake DOM and a fake Core:
// which thread opens, what the person's pick and the host's targets keep, how a
// thread is read and written to, the project-less chat, the change feed, the
// background, the heading, and the words a host can replace.

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

function optionLabels(root: FakeElement): string[] {
  return root.byClass("chat-thread-select")[0]!.querySelectorAll("option").map((option) => option.textContent);
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
    assert.deepEqual(optionLabels(root), ["Bravo (waiting on you)", "Charlie", "Alpha"]);
    assert.deepEqual(words(root), ["B turn 1"]);
    assert.deepEqual(heard.selected, ["B"]);
    assert.deepEqual(heard.unanswered, [1]);
    assert.equal(heard.titles.at(-1), "Bravo");
    assert.equal(root.byClass("chat-thread-picker")[0]!.hidden, false);
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
    const picker = root.byClass("chat-thread-select")[0]!;
    picker.value = "A";
    picker.dispatch("change");
    await tick(0);
    assert.deepEqual(chat.target(), { kind: "thread", conversationId: "A", projectId: "project-1" });
    assert.deepEqual(words(root), ["A turn 1"]);
    core.threads[2]!.pendingAskCount = 2;
    core.emit();
    await tick(300);
    assert.equal(openThread(chat), "A", "the first thread of the list is now C, and the pick stays");
    assert.deepEqual(heard.selected, ["B", "A"]);
    assert.equal(picker.value, "A");
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
    assert.equal(root.byClass("chat-thread-picker")[0]!.hidden, true);
    assert.equal(root.byClass("chat-thread-header")[0]!.textContent.includes("conv-secret-id-1"), false);
    assert.equal(root.byClass("chat-thread-header").some((header) => header.querySelectorAll("button").length > 0), false, "no Refresh control");
  });
});

test("a host that takes the chat's name hears it, and the header holds only the picker when there is one", async () => {
  const core = threadsCore([thread("only", { title: "Nightly run" })]);
  const titles: string[] = [];
  await mounted(core.transport(), { threads: hear({ onTitle: (title) => titles.push(title) }).threads }, {}, async (_chat, root) => {
    await settle();
    assert.equal(titles.at(-1), "Nightly run");
    assert.equal(root.byClass("chat-thread-header")[0]!.hidden, true);
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
