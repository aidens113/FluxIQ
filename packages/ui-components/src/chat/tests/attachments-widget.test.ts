// What a turn carries, end to end under a fake DOM: a panel's record is a quiet
// line and never the person's bubble, a hidden kind shows nothing, a drawable
// kind is read once and drawn, a failed read and an unknown kind say what they
// are with the reference and Open, and a re-read of the thread neither reloads
// nor redraws it. The turn meta and the model-key line's purpose ride along.

import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { createChatWidget, type ChatWidget, type ChatWidgetOptions } from "../chat-widget.ts";
import type { ChatAttachment, ChatAttachmentContext, ChatAttachmentPort, ChatOpenControlFactory, ChatResult } from "../ports/index.ts";
import { fake, withFakeDocument, type FakeElement } from "../../testing/index.ts";
import { createAttachmentView } from "../view/index.ts";
import { asksCore, coreTurn, type AsksCore } from "./asks-core.ts";
import { hostStatus } from "./host-status.ts";

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.useRealTimers();
});

type Deferred = { promise: Promise<ChatResult<unknown>>; resolve(result: ChatResult<unknown>): void };
function deferred(): Deferred {
  let resolve!: (result: ChatResult<unknown>) => void;
  const promise = new Promise<ChatResult<unknown>>((done) => { resolve = done; });
  return { promise, resolve };
}

type Spy = { reads: ChatAttachmentContext[]; opened: ChatAttachment[]; port: ChatAttachmentPort };

/** A host that draws `flow-diff`, calls `panel-result` a record and `panel-capability` hidden, and knows no other kind. */
function host(read: (context: ChatAttachmentContext) => Promise<ChatResult<unknown>> | undefined = (context) => Promise.resolve({ ok: true, value: { attachment: { attachment: context.attachment, payload: { rows: 2 } } } })): Spy {
  const spy: Spy = {
    reads: [],
    opened: [],
    port: {
      isRecord: (attachment) => attachment.kind === "panel-result",
      isHidden: (attachment) => attachment.kind === "panel-capability",
      label: (kind) => (kind === "flow-diff" ? "Flow changes" : "Attachment"),
      drawer: (kind) => (kind === "flow-diff"
        ? (payload) => {
          const drawn = document.createElement("div");
          drawn.className = "host-diff";
          drawn.textContent = `diff of ${(payload as { rows: number }).rows} rows`;
          return drawn;
        }
        : null),
      read: (context) => {
        spy.reads.push(context);
        return read(context) ?? Promise.resolve({ ok: false, sentence: "No." });
      },
      open: (attachment) => { spy.opened.push(attachment); }
    }
  };
  return spy;
}

async function mounted(core: AsksCore, options: ChatWidgetOptions, body: (root: FakeElement, chat: ChatWidget) => Promise<void>): Promise<void> {
  await withFakeDocument(async () => {
    const chat = createChatWidget(core.transport(), options);
    chat.render(hostStatus({ connected: true, projectId: "project-1" }));
    chat.setActive(true);
    try {
      await settle();
      await body(fake(chat.element), chat);
    } finally {
      chat.setActive(false);
      // Stopping redraws the thread, which reads its attachments afresh; let those land while the fake document is still there.
      await settle();
    }
  });
}

const attachmentOf = (kind: string, ref = "ref-1") => ({ kind, ref });

test("a panel's record is a quiet line on FluxIQ's side, never the person's bubble", async () => {
  const core = asksCore([coreTurn("t1", { author: "person", text: "Started the run", attachment: attachmentOf("panel-result") })]);
  await mounted(core, { attachments: host().port }, async (root) => {
    const entry = root.byClass("chat-msg")[0]!;
    assert.equal(entry.getAttribute("data-author"), "fluxiq");
    assert.equal(entry.byClass("chat-bubble").length, 0);
    assert.equal(entry.byClass("chat-record")[0]!.textContent, "Started the run");
    assert.equal(entry.byClass("chat-attachment").length, 0, "a record draws no attachment");
  });
});

test("without the port a person's turn with an attachment is still the person's bubble and nothing is drawn", async () => {
  const core = asksCore([coreTurn("t1", { author: "person", text: "Started the run", attachment: attachmentOf("panel-result") })]);
  await mounted(core, {}, async (root) => {
    const entry = root.byClass("chat-msg")[0]!;
    assert.equal(entry.getAttribute("data-author"), "person");
    assert.equal(entry.byClass("chat-bubble")[0]!.textContent, "Started the run");
    assert.equal(entry.byClass("chat-attachment").length, 0);
  });
});

test("turnMeta names who said it and when for a screen reader, and on hover; a record is FluxIQ panel", async () => {
  const core = asksCore([
    coreTurn("t1", { author: "person", text: "Hello" }),
    coreTurn("t2", { author: "person", text: "Started the run", attachment: attachmentOf("panel-result"), createdAt: 2_000 }),
    coreTurn("t3", { text: "Done", createdAt: 3_000 })
  ]);
  core.turns[0]!.createdAt = 1_000;
  await mounted(core, { attachments: host().port, turnMeta: { formatTime: (ms) => `at ${ms}` } }, async (root) => {
    const [person, record, answer] = root.byClass("chat-msg");
    const header = (entry: FakeElement) => entry.children.find((child) => child.tagName === "HEADER")!;
    assert.equal(header(person!).byClass("chat-sr-only").length + (header(person!).className === "chat-sr-only" ? 1 : 0), 1);
    assert.equal(header(person!).children[0]!.textContent, "You");
    assert.equal(header(record!).children[0]!.textContent, "FluxIQ panel");
    assert.equal(header(answer!).children[0]!.textContent, "FluxIQ");
    assert.equal(header(answer!).children[1]!.textContent, "at 3000");
    assert.equal(person!.title, "at 1000");
    assert.equal(answer!.title, "at 3000");
  });
});

test("a hidden kind shows nothing of its attachment, and the turn's own words stay", async () => {
  const spy = host();
  const core = asksCore([coreTurn("t1", { text: "Ran it for you.", attachment: attachmentOf("panel-capability") })]);
  await mounted(core, { attachments: spy.port }, async (root) => {
    assert.equal(root.byClass("chat-attachment").length, 0);
    assert.equal(spy.reads.length, 0, "a hidden kind is never read");
    assert.equal(root.byClass("chat-msg")[0]!.textContent.includes("Ran it for you."), true);
  });
});

test("a drawable kind says it is reading, is read once with its turn's place, and is then the host's drawing", async () => {
  const wait = deferred();
  const spy = host(() => wait.promise);
  const core = asksCore([coreTurn("t1", { attachment: attachmentOf("flow-diff", "diff-7") })]);
  await mounted(core, { attachments: spy.port }, async (root) => {
    const box = root.byClass("chat-attachment")[0]!;
    assert.equal(box.getAttribute("data-state"), "reading");
    assert.equal(box.byClass("chat-attachment-words")[0]!.textContent, "Reading flow changes...");
    assert.equal(box.byClass("chat-attachment-ref")[0]!.textContent, "diff-7");
    assert.deepEqual(spy.reads.map(({ projectId, conversationId, turnId, attachment }) => ({ projectId, conversationId, turnId, attachment })), [
      { projectId: "project-1", conversationId: "conv-1", turnId: "t1", attachment: attachmentOf("flow-diff", "diff-7") }
    ]);
    wait.resolve({ ok: true, value: { attachment: { attachment: attachmentOf("flow-diff", "diff-7"), payload: { rows: 2 } } } });
    await settle();
    assert.equal(box.getAttribute("data-state"), "drawn");
    assert.equal(box.children[0]!.className, "host-diff");
    assert.equal(box.children[0]!.textContent, "diff of 2 rows");
    assert.equal(box.byClass("chat-attachment-ref").length, 0, "the drawing replaces the reference");
  });
});

test("a failed read leaves the reference saying it could not be read, with Open", async () => {
  const spy = host(() => Promise.resolve({ ok: false, sentence: "Gone." }));
  const core = asksCore([coreTurn("t1", { attachment: attachmentOf("flow-diff", "diff-7") })]);
  await mounted(core, { attachments: spy.port }, async (root) => {
    const box = root.byClass("chat-attachment")[0]!;
    assert.equal(box.getAttribute("data-state"), "failed");
    assert.equal(box.byClass("chat-attachment-words")[0]!.textContent, "Flow changes could not be read here.");
    assert.equal(box.byClass("chat-attachment-ref")[0]!.textContent, "diff-7");
    box.byClass("small-button")[0]!.dispatch("click");
    assert.deepEqual(spy.opened, [attachmentOf("flow-diff", "diff-7")]);
  });
});

test("a drawer that throws is a read that failed, and a payload it cannot use is no payload", async () => {
  const spy = host(() => Promise.resolve({ ok: true, value: undefined }));
  const core = asksCore([coreTurn("t1", { attachment: attachmentOf("flow-diff") })]);
  await mounted(core, { attachments: spy.port }, async (root) => {
    assert.equal(root.byClass("chat-attachment")[0]!.byClass("chat-attachment-words")[0]!.textContent, "Flow changes could not be read here.");
  });
  const throwing: ChatAttachmentPort = { ...host().port, drawer: () => () => { throw new Error("bad payload"); } };
  await mounted(core, { attachments: throwing }, async (root) => {
    assert.equal(root.byClass("chat-attachment")[0]!.byClass("chat-attachment-words")[0]!.textContent, "Flow changes could not be read here.");
  });
});

test("an unknown kind is a reference kept outside the chat, and Open goes to the host", async () => {
  const spy = host();
  const core = asksCore([coreTurn("t1", { attachment: attachmentOf("screenshot", "shot-3") })]);
  await mounted(core, { attachments: spy.port }, async (root) => {
    const box = root.byClass("chat-attachment")[0]!;
    assert.equal(box.getAttribute("data-state"), "kept");
    assert.equal(box.byClass("chat-attachment-words")[0]!.textContent, "Attachment, kept outside this conversation.");
    assert.equal(box.byClass("chat-attachment-ref")[0]!.textContent, "shot-3");
    assert.equal(spy.reads.length, 0, "nothing can draw it, so nothing is read");
    box.byClass("small-button")[0]!.dispatch("click");
    assert.deepEqual(spy.opened, [attachmentOf("screenshot", "shot-3")]);
  });
});

test("a reference asks whether it can be opened each time it is drawn", async () => {
  const { port } = host();
  let can = false;
  const opener = { ...port, drawer: () => null, canOpen: () => can };
  await withFakeDocument(() => {
    const attachment = { kind: "unknown", ref: "somewhere" };
    const closed = createAttachmentView(opener, attachment, undefined);
    assert.equal(fake(closed.element).querySelectorAll("button").length, 0);
    can = true;
    const opened = createAttachmentView(opener, attachment, undefined);
    assert.equal(fake(opened.element).querySelectorAll("button").length, 1);
  });
});

test("with no way to open it the reference has no Open, and a drawable kind with no read stays a reference", async () => {
  const { open: _open, read: _read, ...bare } = host().port;
  const core = asksCore([coreTurn("t1", { attachment: attachmentOf("flow-diff") })]);
  await mounted(core, { attachments: bare }, async (root) => {
    const box = root.byClass("chat-attachment")[0]!;
    assert.equal(box.getAttribute("data-state"), "kept");
    assert.equal(box.byClass("small-button").length, 0);
  });
});

test("a re-read of the thread keeps the turn's attachment: not read again, not redrawn", async () => {
  vi.useFakeTimers();
  const spy = host();
  const core = asksCore([coreTurn("t1", { attachment: attachmentOf("flow-diff") })]);
  await withFakeDocument(async () => {
    const chat = createChatWidget(core.transport(), { attachments: spy.port });
    chat.render(hostStatus({ connected: true, projectId: "project-1" }));
    chat.setActive(true);
    try {
      await vi.advanceTimersByTimeAsync(10);
      const root = fake(chat.element);
      const drawn = root.byClass("chat-attachment")[0]!;
      assert.equal(drawn.getAttribute("data-state"), "drawn");
      const readsBefore = core.reads;
      core.turns.push(coreTurn("t2", { text: "A newer turn" }));
      core.touch();
      await vi.advanceTimersByTimeAsync(4_100);
      assert.ok(core.reads > readsBefore, "the thread was read again");
      assert.equal(root.byClass("chat-msg").length, 2, "and the new turn shows");
      assert.equal(spy.reads.length, 1, "the attachment was read once");
      assert.equal(root.byClass("chat-attachment")[0], drawn, "and it is the same element, still drawn");
      assert.equal(drawn.getAttribute("data-state"), "drawn");
    } finally {
      chat.setActive(false);
      await vi.advanceTimersByTimeAsync(10);
    }
  });
});

test("a read that lands after the thread changed is dropped", async () => {
  const wait = deferred();
  const spy = host(() => wait.promise);
  const core = asksCore([coreTurn("t1", { attachment: attachmentOf("flow-diff") })]);
  await mounted(core, { attachments: spy.port }, async (root, chat) => {
    const box = root.byClass("chat-attachment")[0]!;
    assert.equal(box.getAttribute("data-state"), "reading");
    chat.open({ kind: "automation", flowId: "flow-9", name: "Other" });
    wait.resolve({ ok: true, value: { rows: 2 } });
    await settle();
    assert.equal(box.getAttribute("data-state"), "reading", "the late answer drew nothing into the old thread's view");
    assert.equal(box.byClass("host-diff").length, 0);
  });
});

test("the model-key line's control says it is for a model key, and an ask's says it is for an ask", async () => {
  const made: string[] = [];
  const openControl: ChatOpenControlFactory = (style) => {
    made.push(style.purpose ?? "none");
    return { element: document.createElement("a"), observe: () => undefined };
  };
  const core = asksCore([]);
  await withFakeDocument(async () => {
    const chat = createChatWidget({ ...core.transport(), models: { readKeys: async () => ({ ok: true, value: { keys: [] } }) } }, { openControl });
    chat.render(hostStatus({ connected: true }));
    await settle();
    assert.deepEqual(made, ["model-key"]);
  });
});
