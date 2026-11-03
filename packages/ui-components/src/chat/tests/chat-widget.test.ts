// The mounted chat, end to end under a fake DOM: `open` switches between the
// latest thread and an automation's (with the context line and its way back),
// what the person sends goes to the thread on screen, an example prompt only
// fills the composer, the chat has no header of its own, and a settled
// build's every step stays in the chat as its own message, between the
// person's message and the answer.

import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { createChatWidget, type ChatWidget, type ChatWidgetOptions } from "../chat-widget.ts";
import { targetCore, type TargetCore } from "../conversation/tests/target-core.ts";
import type { ChatTarget } from "../target.ts";
import { MODEL_KEY_LINE, ONBOARDING_CONCEPT } from "../view/index.ts";
import { fake, withFakeDocument, type FakeElement } from "../../testing/index.ts";
import { hostStatus } from "./host-status.ts";
import { messageTransport, TEST_MESSAGES, TEST_ACTIVITY_MESSAGES, type TestMessage } from "./message-transport.ts";
import type { ChatOpenControlFactory, ChatResult } from "../ports/index.ts";

const opener: ChatOpenControlFactory = () => ({ element: document.createElement("a"), observe: () => undefined });

const CONNECTED = hostStatus({ connected: true });
const AUTOMATION: ChatTarget = { kind: "automation", flowId: "flow-7", name: "Price tracker" };
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function mount(core: TargetCore, options: ChatWidgetOptions = {}): ChatWidget {
  const request = async <T>(message: TestMessage): Promise<ChatResult<T>> => core.request<T>(message);
  const chat = createChatWidget(messageTransport(request), { openControl: opener, ...options });
  chat.render(CONNECTED);
  return chat;
}

function twoThreads(): TargetCore {
  return targetCore([
    { conversationId: "conv-flow", subjectKind: "flow", subjectId: "flow-7", turns: [{ turnId: "f1", author: "automation", text: "Price tracker is ready." }] },
    { conversationId: "conv-latest", subjectKind: "project", subjectId: "project-1", turns: [{ turnId: "l1", author: "person", text: "Find cheap lamps" }] }
  ]);
}

function words(root: FakeElement): string[] {
  return root.byClass("chat-msg").map((message) => message.textContent);
}

test("open switches threads, shows the automation's name with a way back, and tells who listens", async () => {
  await withFakeDocument(async () => {
    const core = twoThreads();
    const chat = mount(core);
    const heard: ChatTarget[] = [];
    chat.onTargetChange((target) => heard.push(target));
    await settle();
    const root = fake(chat.element);
    assert.deepEqual(words(root), ["Find cheap lamps"]);
    const context = root.byClass("chat-context")[0]!;
    assert.equal(context.hidden, true, "the latest chat needs no context line");

    chat.open(AUTOMATION);
    assert.deepEqual(chat.target(), AUTOMATION);
    assert.equal(context.hidden, false);
    assert.equal(root.byClass("chat-context-name")[0]!.textContent, "Price tracker");
    assert.deepEqual(words(root), [], "the latest thread's turns are gone at once");
    await settle();
    assert.deepEqual(words(root), ["Price tracker is ready."]);

    root.byClass("chat-context-back")[0]!.dispatch("click");
    assert.deepEqual(chat.target(), { kind: "latest" });
    await settle();
    assert.deepEqual(words(root), ["Find cheap lamps"]);
    assert.deepEqual(heard, [AUTOMATION, { kind: "latest" }]);
    assert.equal(root.byClass("chat-header").length + root.byClass("chat-overlay").length, 0, "no header of its own");
  });
});

test("what the person sends goes to the thread on screen", async () => {
  await withFakeDocument(async () => {
    const core = twoThreads();
    const chat = mount(core);
    await settle();
    chat.open(AUTOMATION);
    await settle();
    const root = fake(chat.element);
    const box = root.descendants().find((element) => element.id === "conversationInput")!;
    box.value = "Run it now";
    box.dispatch("input");
    box.dispatch("keydown", { key: "Enter", shiftKey: false, isComposing: false, keyCode: 13, preventDefault: () => undefined });
    await settle();
    const sent = core.sent.filter((message) => message.type === TEST_MESSAGES.panelConversationSend);
    assert.equal(sent.length, 1);
    assert.equal(sent[0]!.conversationId, "conv-flow");
    assert.deepEqual(core.thread("conv-latest")?.turns.length, 1, "the latest thread got nothing");
    await settle();
    assert.deepEqual(words(root), ["Price tracker is ready.", "Run it now"]);
    assert.equal(box.value, "", "the box empties once FluxIQ has the message");
  });
});

test("an empty automation chat offers examples that fill the composer and send nothing", async () => {
  await withFakeDocument(async () => {
    const core = targetCore([]);
    const chat = mount(core);
    chat.open({ kind: "automation", flowId: "flow-9", name: "Job alerts" });
    await settle();
    const root = fake(chat.element);
    const empty = root.byClass("chat-empty")[0]!;
    assert.equal(empty.hidden, false);
    assert.equal(root.byClass("chat-empty-title")[0]!.textContent, "Ask about Job alerts");
    const examples = root.byClass("chat-example");
    assert.equal(examples.length, 3);
    examples[0]!.dispatch("click");
    const box = root.descendants().find((element) => element.id === "conversationInput")!;
    assert.equal(box.value, examples[0]!.textContent);
    assert.equal(core.sent.some((message) => message.type === TEST_MESSAGES.panelConversationSend), false);
    assert.equal(box.placeholder, "Message FluxIQ about Job alerts");
  });
});

test("an automation's chat shows only that automation's live work", async () => {
  await withFakeDocument(async () => {
    const core = twoThreads();
    const at = (second: number) => new Date(Date.UTC(2026, 8, 30, 12, 0, second)).toISOString();
    const other = { activityId: "run:r2", sequence: 1, subject: { kind: "run", id: "r2", projectId: "p", flowId: "flow-8" }, phase: "running", label: "x", at: at(1), detail: { kind: "step", title: "Open the other site", status: "started" } };
    const mine = { activityId: "run:r1", sequence: 2, subject: { kind: "run", id: "r1", projectId: "project-1", flowId: "flow-7" }, phase: "running", label: "y", at: at(2), detail: { kind: "step", title: "Open the price page", status: "started" } };
    const state = { current: mine, display: null, recent: [other, mine], overlay: "expanded", live: true };
    const request = async <T>(message: TestMessage): Promise<ChatResult<T>> =>
      message.type === TEST_ACTIVITY_MESSAGES.read ? { ok: true, value: { ok: true, state } as T } : core.request<T>(message);
    const chat = createChatWidget(messageTransport(request), { openControl: opener });
    try {
      chat.render(CONNECTED);
      chat.setActive(true);
      chat.open(AUTOMATION);
      await settle();
      const titles = fake(chat.element).byClass("chat-step-title").map((element) => element.textContent);
      assert.deepEqual(titles, ["Open the price page"]);
      chat.open({ kind: "latest" });
      await settle();
      assert.deepEqual(fake(chat.element).byClass("chat-step-title").map((element) => element.textContent), ["Open the other site", "Open the price page"]);
    } finally {
      chat.setActive(false);
    }
  });
});

test("a panel that names the automation itself can leave the chat's context line out", async () => {
  await withFakeDocument(async () => {
    const core = twoThreads();
    const request = async <T>(message: TestMessage): Promise<ChatResult<T>> => core.request<T>(message);
    const chat = createChatWidget(messageTransport(request), { openControl: opener, contextLine: false });
    chat.render(CONNECTED);
    chat.open(AUTOMATION);
    await settle();
    const root = fake(chat.element);
    assert.equal(root.byClass("chat-context").length, 0);
    assert.deepEqual(words(root), ["Price tracker is ready."]);
  });
});

test("a run waiting on the person in a thread not on screen shows in the latest chat, and one click brings its Continue and Stop", async () => {
  // A run started from the automations tab: Core parks its person-needed ask
  // in the run's own thread (subject run), which no chat on screen shows.
  await withFakeDocument(async () => {
    const ask = "FluxIQ needs you: complete the check on this page, then press Continue.";
    const core = targetCore([
      {
        conversationId: "conv-run-r1",
        subjectKind: "run",
        subjectId: "r1",
        turns: [{ turnId: "q1", author: "automation", text: ask, ask: { askId: "ask-1", kind: "choice", status: "pending", options: [{ id: "done", label: "Continue" }, { id: "stop", label: "Stop" }] } }]
      },
      { conversationId: "conv-latest", subjectKind: "project", subjectId: "project-1", turns: [{ turnId: "l1", author: "person", text: "Find cheap lamps" }] }
    ]);
    const at = new Date(Date.UTC(2026, 8, 30, 12, 0, 5)).toISOString();
    const waiting = { activityId: "run:r1", sequence: 5, subject: { kind: "run", id: "r1", projectId: "project-1", flowId: "flow-7" }, phase: "waiting_permission", label: ask, at, detail: { kind: "ask", title: "Asked the person to complete a check", status: "started", ref: "ask-1" } };
    const display = { activityId: "run:r1", subjectKind: "run", phase: "waiting_permission", headline: "Waiting for you: answer in the FluxIQ panel", detail: ask, step: null, working: false, outcome: "waiting", sequence: 5 };
    const state = { current: waiting, display, recent: [waiting], overlay: "expanded", live: true };
    const request = async <T>(message: TestMessage): Promise<ChatResult<T>> =>
      message.type === TEST_ACTIVITY_MESSAGES.read ? { ok: true, value: { ok: true, state } as T } : core.request<T>(message);
    const chat = createChatWidget(messageTransport(request), { openControl: opener });
    try {
      chat.render(CONNECTED);
      chat.setActive(true);
      await settle();
      const root = fake(chat.element);
      assert.deepEqual(words(root), ["Find cheap lamps"]);
      const live = root.byClass("chat-live")[0]!;
      assert.equal(live.hidden, false, "the latest chat shows the wait");
      assert.equal(live.getAttribute("data-state"), "waiting");
      assert.equal(root.byClass("chat-live-detail")[0]!.textContent, ask);
      const action = root.byClass("chat-live-action")[0]!;
      assert.equal(action.hidden, false);
      assert.equal(action.textContent, "Show the question");

      action.dispatch("click");
      assert.deepEqual(chat.target(), { kind: "question", activityId: "run:r1", subjectKind: "run", subjectId: "r1", title: "The run's question", projectId: "project-1" });
      assert.equal(root.byClass("chat-context")[0]!.hidden, false);
      assert.equal(root.byClass("chat-context-name")[0]!.textContent, "The run's question");
      assert.equal(root.byClass("chat-context-kind")[0]!.hidden, true);
      await settle();
      const listed = core.sent.filter((message) => message.type === TEST_MESSAGES.panelConversationRead && message.kind === "list").at(-1);
      assert.equal(listed?.subjectKind, "run");
      assert.equal(listed?.subjectId, "r1");
      assert.equal(words(root).length, 1);
      assert.match(words(root)[0]!, /complete the check on this page/u);
      assert.equal(root.byClass("chat-live-action")[0]!.hidden, true, "the question is on screen now");
      const buttons = root.byClass("small-button");
      assert.deepEqual(buttons.map((button) => button.textContent), ["Continue", "Stop"]);

      buttons[0]!.dispatch("click");
      await settle();
      const answered = core.sent.filter((message) => message.type === TEST_MESSAGES.panelConversationAnswer);
      assert.deepEqual(answered.map((message) => [message.askId, message.kind, message.value]), [["ask-1", "choice", "done"]]);

      root.byClass("chat-context-back")[0]!.dispatch("click");
      assert.deepEqual(chat.target(), { kind: "latest", projectId: "project-1" });
      await settle();
      assert.deepEqual(words(root), ["Find cheap lamps"]);
    } finally {
      chat.setActive(false);
    }
  });
});

test("a settled build's every decision stays as its own message, with its reason, between the message and the answer", async () => {
  await withFakeDocument(async () => {
    const second = (value: number) => Date.UTC(2026, 8, 30, 12, 0, 0) + value * 1_000;
    const core = targetCore([{
      conversationId: "conv-latest",
      subjectKind: "project",
      subjectId: "project-1",
      turns: [
        { turnId: "p1", author: "person", text: "Get me a quote", createdAt: second(0) },
        { turnId: "a1", author: "automation", text: "Your quote form is ready.", createdAt: second(500) }
      ]
    }]);
    const subject = { kind: "build", id: "b1", projectId: "project-1" };
    const history: unknown[] = [];
    const recent: unknown[] = [];
    for (let index = 1; index <= 80; index += 1) {
      const at = new Date(second(index * 5)).toISOString();
      const title = `Clicking button ${index}`;
      const decided = { activityId: "build:b1", sequence: index * 3, subject, phase: "exploring", label: title, at, detail: { kind: "thought", title, text: `Reason ${index}.`, status: "succeeded" } };
      const acted = { activityId: "build:b1", sequence: index * 3 + 1, subject, phase: "exploring", label: title, at, detail: { kind: "tool", title, ref: "core.run_node", status: "succeeded" } };
      history.push(decided, acted);
      recent.push({ activityId: "build:b1", sequence: index * 3 - 1, subject, phase: "thinking", label: "Deciding", at, detail: { kind: "thought", title: "Deciding the next step", status: "started" } }, decided, acted);
    }
    const display = { activityId: "build:b1", subjectKind: "build", phase: "done", headline: "Flow ready", detail: null, step: null, working: false, outcome: "done", sequence: 241 };
    const state = { current: recent.at(-1), display, recent: recent.slice(-60), history, overlay: "expanded", live: true };
    const request = async <T>(message: TestMessage): Promise<ChatResult<T>> =>
      message.type === TEST_ACTIVITY_MESSAGES.read ? { ok: true, value: { ok: true, state } as T } : core.request<T>(message);
    const chat = createChatWidget(messageTransport(request), { openControl: opener });
    try {
      chat.render(CONNECTED);
      chat.setActive(true);
      await settle();
      const root = fake(chat.element);
      const stream = root.byClass("chat-stream")[0]!.children.filter((child) => !child.hidden);
      assert.equal(stream.length, 82);
      assert.equal(stream[0]!.getAttribute("data-author"), "person");
      assert.equal(stream[81]!.getAttribute("data-author"), "fluxiq");
      const steps = root.byClass("chat-step-msg");
      assert.equal(steps.length, 80, "all 80 decisions, not only the relay's last 60 events");
      assert.equal(steps[0]!.byClass("chat-step-title")[0]!.textContent, "Clicking button 1");
      assert.equal(steps[0]!.byClass("chat-step-text")[0]!.textContent, " — Reason 1.");
      assert.equal(steps[0]!.byClass("chat-card-outcome")[0]!.textContent, "Done");
      assert.equal(steps[0]!.byClass("chat-card")[0]!.getAttribute("aria-label"), "Click: Done");
      assert.equal(root.byClass("chat-work").length, 0, "no fold");
    } finally {
      chat.setActive(false);
    }
  });
});

test("the empty latest chat is the onboarding: Describe puts the caret in the composer and sends nothing", async () => {
  await withFakeDocument(async () => {
    const core = targetCore([]);
    const chat = mount(core, { onExtract: () => undefined });
    await settle();
    const root = fake(chat.element);
    assert.equal(root.byClass("chat-empty")[0]!.hidden, false);
    assert.equal(root.byClass("chat-empty-line")[0]!.textContent, ONBOARDING_CONCEPT);
    const starts = root.byClass("chat-start");
    assert.deepEqual(starts.map((start) => start.textContent), ["Describe what you want", "Extract data from this page"]);
    assert.equal(root.byClass("chat-example").length, 3, "the examples stay as fill-only chips");
    const box = root.descendants().find((element) => element.id === "conversationInput")!;
    let focused = 0;
    box.focus = () => { focused += 1; };
    starts[0]!.dispatch("click");
    assert.equal(focused, 1, "the caret is in the composer");
    assert.equal(box.value, "");
    await settle();
    assert.equal(core.sent.some((message) => message.type === TEST_MESSAGES.panelConversationSend), false, "nothing was sent");
  });
});

test("a client without onExtract is not offered \"Extract data from this page\"", async () => {
  await withFakeDocument(async () => {
    const chat = mount(targetCore([]));
    await settle();
    const starts = fake(chat.element).byClass("chat-start");
    assert.deepEqual(starts.map((start) => start.textContent), ["Describe what you want"]);
  });
});

test("the empty latest chat asks for the model keys once, says when none is enabled, and Extract still goes to the panel", async () => {
  for (const [reply, line] of [
    [{ ok: true, value: { ok: true, payload: { keys: [{ kind: "model", provider: "deepseek", enabled: false }] } } }, MODEL_KEY_LINE],
    [{ ok: true, value: { ok: true, payload: { keys: [{ kind: "model", provider: "deepseek", enabled: true }] } } }, null],
    [{ ok: false, sentence: "FluxIQ is not connected." }, null]
  ] as const) {
    await withFakeDocument(async () => {
      const core = targetCore([]);
      let asked = 0;
      let extracted = 0;
      const request = async <T>(message: TestMessage): Promise<ChatResult<T>> => {
        if (message.type !== TEST_MESSAGES.panelModelReadiness) return core.request<T>(message);
        asked += 1;
        return reply as unknown as ChatResult<T>;
      };
      const chat = createChatWidget(messageTransport(request), { openControl: opener, onExtract: () => { extracted += 1; } });
      chat.render(CONNECTED);
      await settle();
      await settle();
      const root = fake(chat.element);
      const key = root.byClass("chat-key-line")[0]!;
      assert.equal(asked, 1, "read once while the empty latest chat is on screen");
      assert.equal(key.hidden, line === null, String(line));
      if (line !== null) {
        assert.equal(root.byClass("chat-key-text")[0]!.textContent, line);
        assert.equal(key.children.some((child) => child.tagName === "A"), true, "Open FluxIQ sits beside the line");
      }
      root.byClass("chat-start")[1]!.dispatch("click");
      assert.equal(extracted, 1, "Extract needs no model, so it is always offered");
      chat.render(CONNECTED);
      await settle();
      assert.equal(asked, 1, "a status redraw does not ask again");
    });
  }
});

test("a key added after the chat read it missing lifts the line on the next poll", async () => {
  await withFakeDocument(async () => {
    const core = targetCore([]);
    let enabled = false;
    let asked = 0;
    const request = async <T>(message: TestMessage): Promise<ChatResult<T>> => {
      if (message.type !== TEST_MESSAGES.panelModelReadiness) return core.request<T>(message);
      asked += 1;
      return { ok: true, value: { ok: true, payload: { keys: [{ kind: "llm", provider: "DeepSeek", enabled }] } } } as unknown as ChatResult<T>;
    };
    vi.useFakeTimers({ toFake: ["setInterval"] });
    const chat = createChatWidget(messageTransport(request), { openControl: opener });
    try {
      chat.render(CONNECTED);
      chat.setActive(true);
      await settle();
      await settle();
      const key = fake(chat.element).byClass("chat-key-line")[0]!;
      assert.equal(key.hidden, false, "no key yet: the line shows");
      const first = asked;
      // The key is installed while the panel is open (R4a, moment 1).
      enabled = true;
      vi.advanceTimersByTime(4_000);
      await settle();
      await settle();
      assert.equal(asked, first + 1, "asked again on the poll while it read missing");
      assert.equal(key.hidden, true, "the key is there now: the line is gone");
      vi.advanceTimersByTime(4_000);
      await settle();
      assert.equal(asked, first + 1, "never asked again once a key is enabled");
    } finally {
      chat.setActive(false);
      vi.useRealTimers();
    }
  });
});

test("an automation's empty chat neither offers the starts nor reads the model keys", async () => {
  await withFakeDocument(async () => {
    const core = targetCore([]);
    const chat = mount(core);
    chat.open({ kind: "automation", flowId: "flow-9", name: "Job alerts" });
    const before = core.sent.filter((message) => message.type === TEST_MESSAGES.panelModelReadiness).length;
    await settle();
    const root = fake(chat.element);
    assert.equal(root.byClass("chat-start").length, 0);
    assert.equal(root.byClass("chat-key-line")[0]!.hidden, true);
    assert.equal(core.sent.filter((message) => message.type === TEST_MESSAGES.panelModelReadiness).length, before);
  });
});

// Round 5: a build began under "FluxIQ needs a model key" and then ran with
// one. The chat read the keys when it opened, before the key was added (the
// Lab adds its key just before it types the request), and asked again only on
// the next 4 s poll. A person turning to the composer is the moment the line
// matters, so the keys are read again then.
test("a key added after the chat read it missing lifts the line as soon as the person turns to the composer", async () => {
  await withFakeDocument(async () => {
    const core = targetCore([]);
    let enabled = false;
    let asked = 0;
    const request = async <T>(message: TestMessage): Promise<ChatResult<T>> => {
      if (message.type !== TEST_MESSAGES.panelModelReadiness) return core.request<T>(message);
      asked += 1;
      return { ok: true, value: { ok: true, payload: { keys: [{ kind: "llm", provider: "DeepSeek", enabled }] } } } as unknown as ChatResult<T>;
    };
    const chat = createChatWidget(messageTransport(request), { openControl: opener });
    chat.render(CONNECTED);
    await settle();
    await settle();
    const root = fake(chat.element);
    const key = root.byClass("chat-key-line")[0]!;
    assert.equal(key.hidden, false, "no key yet: the line shows");
    const first = asked;
    enabled = true;
    root.byClass("composer")[0]!.dispatch("focusin");
    await settle();
    await settle();
    assert.equal(asked, first + 1, "read again when the person turns to the composer");
    assert.equal(key.hidden, true, "the key is there now: the line is gone before anything is sent");
    root.byClass("composer")[0]!.dispatch("input");
    await settle();
    assert.equal(asked, first + 1, "a key that reads enabled is not asked about again");
  });
});

test("the welcome starts at its top: an empty chat taller than the view is not pinned to the bottom", async () => {
  await withFakeDocument(async () => {
    const core = targetCore([]);
    const request = async <T>(message: TestMessage): Promise<ChatResult<T>> => core.request<T>(message);
    const chat = createChatWidget(messageTransport(request), { openControl: opener });
    const scroller = fake(chat.element).byClass("chat-scroll")[0]!;
    scroller.scrollHeight = 900;
    scroller.clientHeight = 400;
    chat.render(CONNECTED);
    await settle();
    await settle();
    assert.equal(fake(chat.element).byClass("chat-empty")[0]!.hidden, false, "the welcome is on screen");
    assert.equal(scroller.scrollTop, 0, "the welcome's title is in view, not scrolled off the top");
    assert.equal(fake(chat.element).byClass("chat-jump")[0]!.hidden, true, "no Jump to latest over a welcome");
  });
});

// What a client leaves out of its transport, or its options, the chat leaves out of itself.
test("a client with no recordings port gets a composer with no attach button", async () => {
  await withFakeDocument(async () => {
    const core = targetCore([]);
    const request = (message: TestMessage) => core.request<unknown>(message);
    const without = createChatWidget(messageTransport(request, { omit: ["recordings"] }), { openControl: opener });
    without.render(CONNECTED);
    await settle();
    assert.equal(fake(without.element).byClass("composer-attach").length, 0);
    assert.equal(await without.attachLatestRecording(), false, "there is nothing to attach");
    const withRecordings = createChatWidget(messageTransport(request), { openControl: opener });
    withRecordings.render(CONNECTED);
    assert.equal(fake(withRecordings.element).byClass("composer-attach").length, 1);
    await settle();
  });
});

test("a client with no models port never claims a key is missing, and one with no open control shows the line without a link", async () => {
  await withFakeDocument(async () => {
    const core = targetCore([]);
    const request = async (message: TestMessage): Promise<ChatResult<unknown>> => {
      if (message.type === TEST_MESSAGES.panelModelReadiness) {
        return { ok: true, value: { ok: true, payload: { keys: [{ kind: "model", provider: "deepseek", enabled: false }] } } };
      }
      return core.request<unknown>(message);
    };
    const unknown = createChatWidget(messageTransport(request, { omit: ["models"] }), { openControl: opener });
    unknown.render(CONNECTED);
    await settle();
    assert.equal(fake(unknown.element).byClass("chat-key-line")[0]!.hidden, true);
    const bare = createChatWidget(messageTransport(request));
    bare.render(CONNECTED);
    await settle();
    const key = fake(bare.element).byClass("chat-key-line")[0]!;
    assert.equal(key.hidden, false, "the keys read missing");
    assert.equal(key.children.some((child) => child.tagName === "A"), false, "no Open FluxIQ beside the line");
  });
});

test("an ask's Open FluxIQ is an empty span where the client has no open control", async () => {
  await withFakeDocument(async () => {
    const core = targetCore([{
      conversationId: "conv-latest",
      subjectKind: "project",
      subjectId: "project-1",
      turns: [{ turnId: "q1", author: "automation", text: "Only FluxIQ can answer", ask: { askId: "ask-1", kind: "unsupported-kind", status: "pending" } }]
    }]);
    const chat = createChatWidget(messageTransport((message) => core.request<unknown>(message)));
    chat.render(CONNECTED);
    await settle();
    assert.equal(fake(chat.element).byClass("open-fluxiq").length, 0);
    assert.match(fake(chat.element).textContent, /Answer this in FluxIQ./, "the ask is shown, with only FluxIQ able to answer it");
  });
});
