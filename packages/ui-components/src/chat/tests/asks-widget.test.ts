// A host's words for a question, and the PIN before an answer with a lasting
// effect, end to end under a fake DOM: what is drawn, what a press sends, what
// never asks for a PIN, a refused PIN, a cancel, the fallbacks, and the PIN
// staying out of everything the chat holds or draws.

import assert from "node:assert/strict";
import { test } from "vitest";
import { createChatWidget, type ChatWidget, type ChatWidgetOptions } from "../chat-widget.ts";
import type { ChatAskAction, ChatAskPort, ChatAskPresentation, ChatOpenControlFactory, ChatReauthorizeOutcome, ChatReauthorizeRequest } from "../ports/index.ts";
import { fake, withFakeDocument, type FakeElement } from "../../testing/index.ts";
import { asksCore, coreAsk, coreTurn, type AsksCore } from "./asks-core.ts";
import { hostStatus } from "./host-status.ts";

const PIN = "739104";
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const GRANT: ChatAskAction = {
  id: "grant",
  label: "Allow and run",
  description: "Runs the invocation once",
  tone: "primary",
  kind: "grant",
  reauthorize: { title: "Confirm with your PIN", description: "This runs a flow.", actionLabel: "Authorize" }
};
const DENY: ChatAskAction = { id: "deny", label: "Not now", tone: "danger", kind: "deny" };

const PRESENTATION: ChatAskPresentation = {
  title: "Run Price tracker?",
  description: "FluxIQ wants to run this flow.",
  consequences: ["It opens the shop", "It saves a dataset"],
  note: "The control is \"Run\" (button).",
  actions: [GRANT, DENY],
  takesText: false
};

type Dialog = { request: ChatReauthorizeRequest };

/** A port that words every pending ask as `presentation` and records the dialogs it was asked to draw (null: no dialog at all). */
function port(presentation: ChatAskPresentation | null = PRESENTATION, dialogs: Dialog[] | null = []): { asks: ChatAskPort; seen: unknown[] } {
  const seen: unknown[] = [];
  return {
    seen,
    asks: {
      present: (ask) => {
        seen.push(ask);
        return presentation;
      },
      ...(dialogs === null ? {} : { reauthorize: (request: ChatReauthorizeRequest) => { dialogs.push({ request }); } })
    }
  };
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
    }
  });
}

const button = (root: FakeElement, label: string): FakeElement | undefined => root.descendants().find((node) => node.tagName === "BUTTON" && node.textContent === label);
const pendingCore = (): AsksCore => asksCore([coreTurn("t1", { text: "Shall I run it?", ask: coreAsk("ask-1", "permission", { marker: "raw-record" }) })]);

test("the host's words are drawn: title, lead, consequences, note, and a button per action by tone", async () => {
  const core = pendingCore();
  const { asks, seen } = port();
  await mounted(core, { asks }, async (root) => {
    assert.equal(root.byClass("turn-ask-title")[0]!.textContent, "Run Price tracker?");
    assert.equal(root.byClass("turn-ask-lead")[0]!.textContent, "FluxIQ wants to run this flow.");
    const list = root.byClass("turn-ask-consequences")[0]!;
    assert.equal(list.getAttribute("aria-label"), "Consequences requiring approval");
    assert.deepEqual(list.children.map((item) => item.textContent), ["It opens the shop", "It saves a dataset"]);
    assert.equal(root.byClass("turn-note")[0]!.textContent, "The control is \"Run\" (button).");
    const grant = button(root, "Allow and run")!;
    assert.equal(grant.getAttribute("data-tone"), "primary");
    assert.equal(grant.getAttribute("title"), "Runs the invocation once");
    assert.equal(button(root, "Not now")!.getAttribute("data-tone"), "danger");
    assert.equal(button(root, "Allow"), undefined, "the chat's own buttons give way to the host's");
    assert.equal((seen[0] as { marker?: string }).marker, "raw-record", "the host is given Core's record as it came");
  });
});

test("a grant does not answer; it asks the host's dialog, and submit sends the answer with the PIN", async () => {
  const core = pendingCore();
  const dialogs: Dialog[] = [];
  await mounted(core, { asks: port(PRESENTATION, dialogs).asks }, async (root) => {
    button(root, "Allow and run")!.dispatch("click");
    assert.equal(core.answers.length, 0, "nothing is sent by the press");
    assert.equal(dialogs.length, 1);
    const request = dialogs[0]!.request;
    assert.equal(request.title, "Confirm with your PIN");
    assert.equal(request.description, "This runs a flow.");
    assert.equal(request.actionLabel, "Authorize");
    const outcome = await request.submit(PIN);
    assert.deepEqual(outcome, { ok: true });
    assert.equal(core.answers.length, 1);
    assert.equal(core.answers[0]!.askId, "ask-1");
    assert.equal(core.answers[0]!.kind, "grant");
    assert.equal(core.answers[0]!.authorizationPin, PIN);
    assert.deepEqual(core.answers[0]!.turn, { conversationId: "conv-1", turnId: "t1" });
    await settle();
    assert.equal(root.textContent.includes(PIN), false, "the PIN is nowhere in what is drawn");
    assert.equal(root.byClass("turn-note").some((note) => note.textContent === "You allowed this."), true, "a settled ask keeps the chat's own sentence");
    assert.equal(button(root, "Allow and run"), undefined);
  });
});

test("a refused PIN answers with the error so the dialog stays open, and the ask is still waiting", async () => {
  const core = pendingCore();
  const dialogs: Dialog[] = [];
  core.answerResult = () => ({ ok: false, sentence: "That PIN is not right.", code: "invalid_pin" });
  await mounted(core, { asks: port(PRESENTATION, dialogs).asks }, async (root) => {
    button(root, "Allow and run")!.dispatch("click");
    const outcome: ChatReauthorizeOutcome = await dialogs[0]!.request.submit(PIN);
    assert.deepEqual(outcome, { ok: false, error: "That PIN is not right." });
    await settle();
    assert.ok(button(root, "Allow and run"), "the request is still open to answer");
    assert.equal(root.textContent.includes(PIN), false);
    // A second try with the right PIN goes through.
    core.answerResult = () => ({ ok: true, value: {} });
    assert.deepEqual(await dialogs[0]!.request.submit("000000"), { ok: true });
    assert.equal(core.answers.length, 2);
  });
});

test("cancel sends nothing", async () => {
  const core = pendingCore();
  const dialogs: Dialog[] = [];
  await mounted(core, { asks: port(PRESENTATION, dialogs).asks }, async (root) => {
    button(root, "Allow and run")!.dispatch("click");
    dialogs[0]!.request.cancel();
    await settle();
    assert.equal(core.answers.length, 0);
    assert.ok(button(root, "Allow and run"));
  });
});

test("a refusal asks no PIN: it answers at once", async () => {
  const core = pendingCore();
  const dialogs: Dialog[] = [];
  await mounted(core, { asks: port(PRESENTATION, dialogs).asks }, async (root) => {
    button(root, "Not now")!.dispatch("click");
    await settle();
    assert.equal(dialogs.length, 0);
    assert.equal(core.answers.length, 1);
    assert.equal(core.answers[0]!.kind, "deny");
    assert.equal("authorizationPin" in core.answers[0]!, false);
  });
});

test("a text answer asks no PIN: Send answer sends the words, trimmed", async () => {
  const core = asksCore([coreTurn("t1", { ask: coreAsk("ask-1", "open") })]);
  const dialogs: Dialog[] = [];
  const presentation: ChatAskPresentation = { title: "What should I call it?", description: "", consequences: [], actions: [], takesText: true, textHint: "In your own words.", textMax: 300 };
  await mounted(core, { asks: port(presentation, dialogs).asks }, async (root) => {
    const box = root.byClass("turn-answer-text")[0]!;
    assert.equal(box.getAttribute("aria-label"), "Your answer");
    assert.equal(box.getAttribute("maxlength"), "300");
    assert.equal(root.byClass("turn-note")[0]!.textContent, "In your own words.");
    const send = button(root, "Send answer")!;
    assert.equal(send.disabled, true, "nothing to send yet");
    box.value = "  Weekly prices  ";
    box.dispatch("input");
    assert.equal(send.disabled, false);
    send.dispatch("click");
    await settle();
    assert.equal(dialogs.length, 0);
    assert.equal(core.answers[0]!.kind, "text");
    assert.equal(core.answers[0]!.value, "Weekly prices");
  });
});

test("a refused text answer keeps the words in the box", async () => {
  const core = asksCore([coreTurn("t1", { ask: coreAsk("ask-1", "open") })]);
  core.answerResult = () => ({ ok: false, sentence: "Refused.", code: "failed" });
  const presentation: ChatAskPresentation = { title: "Name it", description: "", consequences: [], actions: [], takesText: true };
  await mounted(core, { asks: port(presentation, []).asks }, async (root) => {
    root.byClass("turn-answer-text")[0]!.value = "Keep me";
    root.byClass("turn-answer-text")[0]!.dispatch("input");
    button(root, "Send answer")!.dispatch("click");
    await settle();
    assert.equal(root.byClass("turn-answer-text")[0]!.value, "Keep me", "the rebuilt box has the typed words back");
    assert.equal(root.textContent.includes("Couldn't send your answer"), true);
  });
});

test("with no reauthorize in the port the grant gives way to the elsewhere sentence and the open control; the refusal stays", async () => {
  const core = pendingCore();
  const made: Array<Parameters<ChatOpenControlFactory>[0]> = [];
  const openControl: ChatOpenControlFactory = (style) => {
    made.push(style);
    return { element: document.createElement("a"), observe: () => undefined };
  };
  await mounted(core, { asks: port(PRESENTATION, null).asks, openControl }, async (root) => {
    assert.equal(button(root, "Allow and run"), undefined);
    assert.ok(button(root, "Not now"), "an answer that needs no PIN stays");
    assert.equal(root.byClass("turn-note").some((note) => note.textContent === "Answer this in FluxIQ."), true);
    assert.equal(made.some((style) => style.purpose === "ask"), true, "the open control says what it is for");
  });
});

test("a port that words nothing leaves the chat's own controls exactly", async () => {
  for (const asks of [undefined, port(null).asks]) {
    const core = pendingCore();
    await mounted(core, asks === undefined ? {} : { asks }, async (root) => {
      assert.ok(button(root, "Allow"));
      assert.ok(button(root, "Don't allow"));
      assert.equal(root.byClass("turn-ask-title").length, 0);
      button(root, "Allow")!.dispatch("click");
      await settle();
      assert.equal(core.answers[0]!.kind, "grant");
      assert.equal("authorizationPin" in core.answers[0]!, false);
    });
  }
});

test("a problem on the answer is drawn as a notice and the next send clears it", async () => {
  const core = pendingCore();
  core.answerResult = () => ({ ok: true, value: { problem: "Allowed, but the run could not start." } });
  await mounted(core, {}, async (root) => {
    button(root, "Allow")!.dispatch("click");
    await settle();
    const says = (text: string) => root.byClass("notice").some((node) => !node.hidden && node.textContent === text);
    assert.equal(says("Allowed, but the run could not start."), true);
    core.sendResult = { ok: true, value: {} };
    const box = root.descendants().find((node) => node.id === "conversationInput")!;
    box.value = "Next";
    box.dispatch("input");
    box.dispatch("keydown", { key: "Enter", shiftKey: false, isComposing: false, keyCode: 13, preventDefault: () => undefined });
    await settle();
    assert.equal(says("Allowed, but the run could not start."), false);
  });
});
