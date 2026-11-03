import assert from "node:assert/strict";
import { test } from "vitest";
import { FakeElement, fake, withFakeDocument } from "../../testing/index.ts";
import { createChatWidget } from "../chat-widget.ts";
import { targetCore } from "../conversation/tests/target-core.ts";
import type { ChatOpenControlFactory } from "../ports/index.ts";
import { hostStatus } from "./host-status.ts";
import { messageTransport, TEST_MESSAGES as M, type TestRequest } from "./message-transport.ts";

const opener: ChatOpenControlFactory = () => ({ element: document.createElement("a"), observe: () => undefined });

async function mounted(body: (view: Awaited<ReturnType<typeof create>>) => void | Promise<void>) {
  await withFakeDocument(async () => {
    const doc = document as unknown as { createElement(tag: string): FakeElement; activeElement: FakeElement; body: FakeElement; focused: boolean; calls: FakeElement[] };
    const make = doc.createElement;
    doc.focused = true;
    doc.calls = [];
    doc.createElement = (tag) => {
      const el = make(tag);
      Object.defineProperties(el, { ownerDocument: { value: doc }, parentElement: { get: () => el.parentNode }, isConnected: { get: () => el === doc.body || doc.body?.descendants().includes(el) } });
      const matches = (node: FakeElement, selector: string) => selector.startsWith(".") ? node.className.split(/\s+/u).includes(selector.slice(1)) : selector.startsWith("#") ? node.id === selector.slice(1) : selector === "[hidden]" ? node.hidden : selector === "[inert]" ? Boolean((node as unknown as { inert: boolean }).inert) : node.tagName.toLowerCase() === selector;
      const closest = (selector: string) => {
        for (let node: FakeElement | null = el; node; node = node.parentNode) if (selector.split(",").some((part) => matches(node!, part.trim()))) return node;
        return null;
      };
      Object.assign(el, { contains: (node: FakeElement) => node === el || el.descendants().includes(node), closest, matches: (selector: string) => matches(el, selector), getClientRects: () => el.isConnected && !closest("[hidden], [inert]") ? [{}] : [], querySelector: (selector: string) => el.descendants().find((node) => matches(node, selector)) ?? null, classList: { contains: (name: string) => el.className.split(/\s+/u).includes(name) } });
      el.focus = () => { if (!el.disabled && !closest("[hidden], [inert]")) {
        doc.activeElement = el;
        doc.calls.push(el);
      } };
      return el;
    };
    doc.body = doc.createElement("body");
    doc.activeElement = doc.body;
    Object.assign(doc, { hasFocus: () => doc.focused });
    try { await body(await create(doc)); } finally { await settle(); }
  });
}

const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
async function create(doc: { body: FakeElement; activeElement: FakeElement; focused: boolean; calls: FakeElement[] }) {
  const core = targetCore([]);
  let refused = false;
  const request: TestRequest = (message) => refused && message.type === M.panelConversationRead ? Promise.resolve({ ok: false, sentence: "Unsupported", unsupported: true }) : core.request(message);
  const chat = createChatWidget(messageTransport(request), { openControl: opener });
  const root = fake(chat.element);
  doc.body.append(root);
  chat.render(hostStatus({ connected: true }));
  chat.open({ kind: "automation", flowId: "f", name: "Orders" });
  await settle();
  const back = root.byClass("chat-context-back")[0]!;
  const box = root.descendants().find((node) => node.id === "conversationInput")!;
  return { chat, root, back, box, core, doc, refuse: () => { refused = true; } };
}

test("Latest Back moves focused source to enabled composer after context hides", async () => mounted(({ chat, root, back, box, doc }) => {
  back.focus();
  back.dispatch("click");
  assert.deepEqual(chat.target(), { kind: "latest" });
  assert.equal(root.byClass("chat-context")[0]!.hidden, true);
  assert.ok(doc.activeElement === box, "focused Back hands off to composer");
}));

test("disabled/hidden composer uses named programmatically focusable Chat fallback", async () => mounted(({ chat, root, back, doc }) => {
  chat.render(hostStatus({ connected: false }));
  back.focus();
  back.dispatch("click");
  assert.ok(doc.activeElement === root, "disabled composer hands off to labelled Chat container");
  assert.equal(root.getAttribute("aria-label"), "Chat with FluxIQ");
  assert.equal(root.getAttribute("tabindex"), "-1");
}));

test("unfocused document, hidden source and unrelated focus never transfer", async () => {
  for (const condition of ["unfocused", "hidden", "external", "document-hidden", "detached"] as const) await mounted(({ root, back, doc }) => {
    back.focus();
    if (condition === "unfocused") doc.focused = false;
    if (condition === "hidden") root.hidden = true;
    if (condition === "document-hidden") Object.assign(document, { visibilityState: "hidden" });
    if (condition === "detached") root.remove();
    if (condition === "external") {
      const outside = fake(document.createElement("input"));
      doc.body.append(outside);
      outside.focus();
    }
    const count = doc.calls.length;
    back.dispatch("click");
    assert.equal(doc.calls.length, count, condition);
  });
});

test("programmatic opens and late old/new replies never reclaim unrelated focus", async () => mounted(async ({ chat, back, core, doc }) => {
  core.hold = true;
  chat.open({ kind: "automation", flowId: "old", name: "Old" });
  back.focus();
  back.dispatch("click");
  const outside = fake(document.createElement("input"));
  doc.body.append(outside);
  outside.focus();
  const count = doc.calls.length;
  chat.open({ kind: "automation", flowId: "new", name: "New" });
  chat.render(hostStatus({ connected: true }));
  core.release();
  await settle();
  assert.equal(doc.activeElement, outside);
  assert.equal(doc.calls.length, count);
}));

test("fallback-hidden composer hands Back to the visible named container", async () => mounted(async ({ chat, root, back, doc, refuse }) => {
  refuse();
  chat.open({ kind: "automation", flowId: "other", name: "Other" });
  await settle();
  assert.equal(root.byClass("chat-dock")[0]!.hidden, true);
  back.focus();
  back.dispatch("click");
  assert.ok(doc.activeElement === root);
  assert.equal(root.getAttribute("aria-label"), "Chat with FluxIQ");
}));

test("passive name updates empty copy/controller metadata without read/draft/selection/focus/scroll changes", async () => mounted(async ({ chat, root, box, core, doc }) => {
  const scroller = root.byClass("chat-scroll")[0]!;
  scroller.scrollHeight = 900;
  scroller.clientHeight = 200;
  scroller.scrollTop = 80;
  scroller.dispatch("wheel");
  scroller.dispatch("scroll");
  box.value = "Unsent draft";
  Object.assign(box, { selectionStart: 2, selectionEnd: 7 });
  box.focus();
  const calls = core.sent.length;
  const focusCalls = doc.calls.length;
  chat.updateAutomationName({ flowId: "f", name: "<New orders>" });
  assert.deepEqual(chat.target(), { kind: "automation", flowId: "f", name: "<New orders>" });
  assert.equal(root.byClass("chat-context-name")[0]!.textContent, "<New orders>");
  assert.equal(root.byClass("chat-context-name")[0]!.getAttribute("title"), "<New orders>");
  assert.equal(root.byClass("chat-empty-title")[0]!.textContent, "Ask about <New orders>");
  assert.equal(box.value, "Unsent draft");
  assert.equal((box as unknown as HTMLTextAreaElement).selectionStart, 2);
  assert.equal((box as unknown as HTMLTextAreaElement).selectionEnd, 7);
  assert.equal(scroller.scrollTop, 80);
  assert.equal(core.sent.length, calls);
  assert.equal(doc.calls.length, focusCalls);
  assert.ok(doc.activeElement === box);
  box.dispatch("input");
  box.dispatch("keydown", { key: "Enter", shiftKey: false, isComposing: false, keyCode: 13, preventDefault: () => {} });
  await settle();
  const sent = core.sent.find((message) => message.type === M.panelConversationSend)!;
  assert.equal(sent.title, "<New orders>", "controller's first-send metadata is current");
  assert.equal(sent.subjectId, "f");
}));

test("no-op/old-flow names are fenced; explicit open still follows", async () => mounted(({ chat, root, core, doc }) => {
  let changes = 0;
  chat.onTargetChange(() => changes++);
  const scroller = root.byClass("chat-scroll")[0]!;
  scroller.scrollHeight = 1000;
  scroller.clientHeight = 200;
  scroller.scrollTop = 90;
  scroller.dispatch("wheel");
  scroller.dispatch("scroll");
  const calls = core.sent.length;
  const focusCalls = doc.calls.length;
  chat.updateAutomationName({ flowId: "f", name: "Orders" });
  chat.updateAutomationName({ flowId: "old", name: "Old" });
  assert.equal(changes, 0);
  assert.equal(core.sent.length, calls);
  assert.equal(scroller.scrollTop, 90);
  chat.open({ kind: "automation", flowId: "f", name: "Explicit rename" });
  // This automation's chat is empty: an explicit open shows its welcome from the top (t753), where a passive rename left the view alone.
  assert.equal(scroller.scrollTop, 0);
  assert.equal(changes, 1);
  chat.open({ kind: "latest" });
  chat.updateAutomationName({ flowId: "f", name: "Stale" });
  assert.deepEqual(chat.target(), { kind: "latest" });
  chat.open({ kind: "question", subjectKind: "flow", subjectId: "f", activityId: "build:f", title: "Question" });
  chat.updateAutomationName({ flowId: "f", name: "Stale" });
  assert.equal(chat.target().kind, "question");
  assert.equal(doc.calls.length, focusCalls);
}));

test("passive rename preserves generation so the pending same-flow read still lands", async () => mounted(async ({ chat, root, box, core, doc }) => {
  core.threads.push({ conversationId: "pending-conv", subjectKind: "flow", subjectId: "pending", revision: 1, touched: 10, turns: [{ turnId: "held", author: "person", text: "Pending history" }] });
  core.hold = true;
  chat.open({ kind: "automation", flowId: "pending", name: "Before" });
  box.value = "Still typing";
  box.focus();
  const scroller = root.byClass("chat-scroll")[0]!;
  scroller.scrollHeight = 1000;
  scroller.clientHeight = 200;
  scroller.scrollTop = 70;
  scroller.dispatch("wheel");
  scroller.dispatch("scroll");
  const calls = core.sent.length;
  const focusCalls = doc.calls.length;
  chat.updateAutomationName({ flowId: "pending", name: "After" });
  assert.equal(core.sent.length, calls);
  core.hold = false;
  core.release();
  await settle();
  assert.equal(root.byClass("chat-context-name")[0]!.textContent, "After");
  assert.match(root.byClass("chat-msg")[0]!.textContent, /Pending history/u);
  assert.equal(box.value, "Still typing");
  assert.equal(scroller.scrollTop, 70);
  assert.equal(doc.calls.length, focusCalls);
  assert.ok(doc.activeElement === box);
}));
