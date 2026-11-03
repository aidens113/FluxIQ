// The chat window: a launcher that is always there, a panel that collapses
// without being unmounted, Escape and focus, the badge and the words on it.

import assert from "node:assert/strict";
import { test } from "vitest";
import { fake, withFakeDocument, type FakeElement } from "../../../testing/index.ts";
import { createChatWindow, type ChatWindow, type ChatWindowOptions } from "../chat-window.ts";
import { conversationLauncherLabel } from "../launcher-label.ts";

type Rig = {
  chatWindow: ChatWindow;
  root: FakeElement;
  launcher: FakeElement;
  panel: FakeElement;
  background: boolean[];
  focused: string[];
  press(key: string): void;
  listening(): number;
};

async function rig(body: (rig: Rig) => void, options: ChatWindowOptions = {}): Promise<void> {
  await withFakeDocument(() => {
    const listeners = new Set<(event: { key: string }) => void>();
    const document = globalThis.document as unknown as {
      addEventListener(type: string, listener: (event: { key: string }) => void): void;
      removeEventListener(type: string, listener: (event: { key: string }) => void): void;
    };
    document.addEventListener = (type, listener) => {
      if (type === "keydown") listeners.add(listener);
    };
    document.removeEventListener = (type, listener) => {
      if (type === "keydown") listeners.delete(listener);
    };
    const background: boolean[] = [];
    const chat = { element: globalThis.document.createElement("section"), setBackground: (on: boolean) => background.push(on) };
    const chatWindow = createChatWindow(chat, options);
    const root = fake(chatWindow.element);
    const launcher = root.byClass("chat-window-launcher")[0]!;
    const panel = root.byClass("chat-window-panel")[0]!;
    const focused: string[] = [];
    launcher.focus = () => focused.push("launcher");
    panel.focus = () => focused.push("panel");
    body({ chatWindow, root, launcher, panel, background, focused, press: (key) => [...listeners].forEach((listener) => listener({ key })), listening: () => listeners.size });
  });
}

test("the launcher is always on screen and the window starts collapsed, with the chat in the background", async () => {
  await rig(({ chatWindow, launcher, panel, background, root }) => {
    assert.equal(chatWindow.isOpen(), false);
    assert.equal(panel.hidden, true);
    assert.equal(launcher.hidden, false);
    assert.equal(launcher.getAttribute("aria-expanded"), "false");
    assert.equal(launcher.getAttribute("aria-controls"), panel.id);
    assert.equal(launcher.getAttribute("aria-label"), "Open the FluxIQ conversation");
    assert.equal(launcher.getAttribute("title"), "Open the FluxIQ conversation");
    assert.equal(launcher.getAttribute("data-waiting"), "false");
    assert.equal(launcher.querySelectorAll("span")[0]!.textContent, "FluxIQ");
    assert.equal(root.byClass("chat-window-badge")[0]!.hidden, true);
    assert.deepEqual(background, [true]);
    assert.equal(panel.getAttribute("role"), "dialog");
    assert.equal(panel.getAttribute("tabindex"), "-1");
    assert.equal(panel.getAttribute("aria-label"), "FluxIQ conversation");
  });
});

test("the window is called what the host says", async () => {
  await rig(({ panel }) => assert.equal(panel.getAttribute("aria-label"), "Assistant"), { ariaLabel: "Assistant" });
});

test("the badge counts the threads waiting, and the launcher says so in words", async () => {
  await rig(({ chatWindow, launcher, root }) => {
    const badge = root.byClass("chat-window-badge")[0]!;
    chatWindow.setWaiting(1);
    assert.equal(launcher.getAttribute("data-waiting"), "true");
    assert.equal(launcher.querySelectorAll("span")[0]!.textContent, "Needs you");
    assert.equal(badge.hidden, false);
    assert.equal(badge.textContent, "1");
    assert.equal(launcher.getAttribute("aria-label"), "Open the FluxIQ conversation - 1 thread is waiting on your answer");
    chatWindow.setWaiting(3);
    assert.equal(badge.textContent, "3");
    assert.equal(launcher.getAttribute("title"), "Open the FluxIQ conversation - 3 threads are waiting on your answer");
    chatWindow.setWaiting(0);
    assert.equal(launcher.getAttribute("data-waiting"), "false");
    assert.equal(badge.hidden, true);
    assert.equal(launcher.querySelectorAll("span")[0]!.textContent, "FluxIQ");
  });
});

test("the launcher words follow whether the window is open and how many threads wait", () => {
  assert.equal(conversationLauncherLabel(false, 0), "Open the FluxIQ conversation");
  assert.equal(conversationLauncherLabel(true, 0), "Collapse the FluxIQ conversation");
  assert.equal(conversationLauncherLabel(true, 1), "Collapse the FluxIQ conversation - 1 thread is waiting on your answer");
  assert.equal(conversationLauncherLabel(false, 2), "Open the FluxIQ conversation - 2 threads are waiting on your answer");
});

test("opening shows the window, brings the chat forward and puts focus in it; collapsing keeps the DOM and returns focus", async () => {
  await rig(({ chatWindow, launcher, panel, background, focused, root }) => {
    launcher.dispatch("click");
    assert.equal(chatWindow.isOpen(), true);
    assert.equal(panel.hidden, false);
    assert.equal(launcher.getAttribute("aria-expanded"), "true");
    assert.equal(launcher.getAttribute("aria-label"), "Collapse the FluxIQ conversation");
    assert.equal(root.getAttribute("data-open"), "true");
    assert.deepEqual(background, [true, false]);
    assert.deepEqual(focused, ["panel"]);
    const collapse = root.byClass("chat-window-icon")[1]!;
    assert.equal(collapse.getAttribute("aria-label"), "Hide the conversation");
    assert.equal(collapse.getAttribute("title"), "Hide the conversation (Esc)");
    assert.equal(collapse.getAttribute("aria-controls"), panel.id);
    assert.equal(collapse.getAttribute("aria-expanded"), "true");
    collapse.dispatch("click");
    assert.equal(chatWindow.isOpen(), false);
    assert.equal(panel.hidden, true);
    assert.equal(panel.parentNode, root, "collapsed, not unmounted");
    assert.deepEqual(background, [true, false, true]);
    assert.deepEqual(focused, ["panel", "launcher"]);
    launcher.dispatch("click");
    launcher.dispatch("click");
    assert.equal(chatWindow.isOpen(), false, "the launcher also closes it");
  });
});

test("Escape closes an open window and returns focus, unless something over it has the key", async () => {
  let blocked = false;
  await rig(({ chatWindow, focused, press, listening }) => {
    assert.equal(listening(), 0, "a collapsed window listens for nothing");
    chatWindow.open();
    assert.equal(listening(), 1);
    press("a");
    assert.equal(chatWindow.isOpen(), true);
    blocked = true;
    press("Escape");
    assert.equal(chatWindow.isOpen(), true, "a dialog over the window takes Escape for itself");
    blocked = false;
    press("Escape");
    assert.equal(chatWindow.isOpen(), false);
    assert.deepEqual(focused, ["panel", "launcher"]);
    assert.equal(listening(), 0);
  }, { escapeBlocked: () => blocked });
});

test("closing a window that is not open moves nothing", async () => {
  await rig(({ chatWindow, focused, background }) => {
    chatWindow.close();
    chatWindow.open();
    chatWindow.open();
    assert.deepEqual(focused, ["panel"]);
    assert.deepEqual(background, [true, false]);
  });
});

test("the bar names the chat, and the window can be made wider and narrower", async () => {
  await rig(({ chatWindow, panel, root }) => {
    const heading = root.byClass("chat-window-heading")[0]!;
    assert.equal(heading.querySelectorAll("strong")[0]!.textContent, "FluxIQ");
    const title = heading.querySelectorAll("span")[0]!;
    assert.equal(title.hidden, true);
    chatWindow.setTitle(" Company website ");
    assert.equal(title.hidden, false);
    assert.equal(title.textContent, "Company website");
    assert.equal(title.getAttribute("title"), "Company website");
    chatWindow.setTitle("");
    assert.equal(title.hidden, true);
    const width = root.byClass("chat-window-icon")[0]!;
    assert.equal(width.getAttribute("aria-label"), "Make the conversation wider");
    assert.equal(width.getAttribute("title"), "Wider");
    assert.equal(panel.getAttribute("data-wide"), "false");
    assert.equal(width.descendants()[0]!.getAttribute("data-icon"), "maximize-2");
    width.dispatch("click");
    assert.equal(width.getAttribute("aria-label"), "Make the conversation narrower");
    assert.equal(width.getAttribute("title"), "Narrower");
    assert.equal(panel.getAttribute("data-wide"), "true");
    assert.equal(width.descendants()[0]!.getAttribute("data-icon"), "minimize-2");
  });
});

test("each window has its own panel id", async () => {
  const ids: string[] = [];
  await rig(({ panel }) => ids.push(panel.id));
  await rig(({ panel }) => ids.push(panel.id));
  assert.notEqual(ids[0], ids[1]);
});
