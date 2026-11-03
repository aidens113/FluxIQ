// "FluxIQ stopped here and is waiting on your answer." with Show me, under a
// fake DOM: shown only when asked for and only while a turn holds a question
// nobody answered; Show me moves the transcript's own scroll to that turn and
// never asks the browser to scroll the page.

import assert from "node:assert/strict";
import { test } from "vitest";
import { createChatWidget, type ChatWidget, type ChatWidgetOptions } from "../chat-widget.ts";
import { fake, withFakeDocument, type FakeElement } from "../../testing/index.ts";
import { asksCore, coreAsk, coreTurn, type AsksCore } from "./asks-core.ts";
import { hostStatus } from "./host-status.ts";

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const WORDS = "FluxIQ stopped here and is waiting on your answer.";

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

const waiting = (): AsksCore => asksCore([
  coreTurn("t1", { text: "First" }),
  coreTurn("t2", { text: "Shall I run it?", ask: coreAsk("ask-1") }),
  coreTurn("t3", { text: "Last" })
]);

test("the banner shows while a question waits, with the words and Show me", async () => {
  await mounted(waiting(), { pendingBanner: true }, async (root) => {
    const banner = root.byClass("chat-pending")[0]!;
    assert.equal(banner.hidden, false);
    assert.equal(banner.byClass("chat-pending-words")[0]!.textContent, WORDS);
    assert.equal(banner.children.some((child) => child.tagName === "BUTTON" && child.textContent === "Show me"), true);
  });
});

test("without the option there is no banner, and with no waiting question it is hidden", async () => {
  await mounted(waiting(), {}, async (root) => {
    assert.equal(root.byClass("chat-pending").length, 0);
  });
  await mounted(asksCore([coreTurn("t1", { text: "Just words" })]), { pendingBanner: true }, async (root) => {
    assert.equal(root.byClass("chat-pending")[0]!.hidden, true);
  });
});

test("answering the question takes the banner away", async () => {
  const core = waiting();
  await mounted(core, { pendingBanner: true }, async (root) => {
    const banner = root.byClass("chat-pending")[0]!;
    root.descendants().find((node) => node.tagName === "BUTTON" && node.textContent === "Allow")!.dispatch("click");
    await settle();
    assert.equal(banner.hidden, true);
  });
});

test("Show me scrolls the transcript itself to the turn, and never the page", async () => {
  await mounted(waiting(), { pendingBanner: true }, async (root) => {
    const scroller = root.byClass("chat-scroll")[0]!;
    const turn = root.byClass("chat-msg").find((entry) => entry.getAttribute("data-turn-id") === "t2")!;
    let pageScrolls = 0;
    Object.assign(turn, { scrollIntoView: () => { pageScrolls += 1; } });
    Object.assign(scroller, { getBoundingClientRect: () => ({ top: 100 }) });
    Object.assign(turn, { getBoundingClientRect: () => ({ top: 340 }) });
    scroller.scrollTop = 50;
    root.byClass("chat-pending")[0]!.children.find((child) => child.tagName === "BUTTON")!.dispatch("click");
    assert.equal(scroller.scrollTop, 290, "the transcript moved by the distance between the two boxes");
    assert.equal(pageScrolls, 0, "the page behind the window did not");
  });
});
