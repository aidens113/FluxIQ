// The chat as a window over the whole page: a launcher in the corner and, when
// opened, the chat in a floating panel. Plain DOM; the host places `element`
// once (fixed to the viewport, so it needs no container).
//
// Three things follow from the chat being the product's general channel to the
// person rather than one view among others, and each is load-bearing:
//
// 1. The launcher is always on screen, with a badge when a thread is holding a
//    question. Someone who has never opened the window still gets told when
//    FluxIQ needs them.
// 2. Collapsed is not unmounted. The panel keeps its DOM, and the chat keeps
//    reading the thread list in the background (`setBackground`), because the
//    badge is the only thing that can tell a person a question arrived and a
//    surface that stops reading when it is closed can never light it. Opening
//    makes the chat read everything at once and follow the tail again.
// 3. Escape closes it and focus comes back to the launcher. It floats without
//    trapping anyone in it, and it does not close under a dialog that has the
//    key for itself (`escapeBlocked`: a re-authorization over the question).
//
// The panel sits `--chat-window-bottom` above the bottom of the page (a host
// with a status bar sets it); it is wider when the person asks (`data-wide`).

import { createElement } from "../../dom/index.ts";
import { lucideIcon } from "../../icons/index.ts";
import type { ChatWidget } from "../chat-widget.ts";
import { conversationLauncherLabel } from "./launcher-label.ts";

/** What the window needs of the chat it holds. */
export type ChatWindowChat = Pick<ChatWidget, "element" | "setBackground">;

/** How a host sets the window up. */
export type ChatWindowOptions = {
  /** What the window is called to a screen reader. */
  ariaLabel?: string;
  /** True while something over the window has the Escape key for itself. */
  escapeBlocked?: () => boolean;
};

/** The mounted window. */
export type ChatWindow = {
  /** The launcher and the window; the host puts it on the page. */
  readonly element: HTMLElement;
  /** How many threads are waiting on the person: the launcher's badge and words. */
  setWaiting(count: number): void;
  /** The chat's name, shown in the window's bar beside "FluxIQ". */
  setTitle(title: string): void;
  open(): void;
  close(): void;
  isOpen(): boolean;
};

let windows = 0;

function iconButton(className: string): HTMLButtonElement {
  return createElement("button", { className, attrs: { type: "button" } });
}

/** Creates the window around `chat`. It starts collapsed, and puts the chat in the background. */
export function createChatWindow(chat: ChatWindowChat, options: ChatWindowOptions = {}): ChatWindow {
  windows += 1;
  const panelId = `chat-window-${windows}`;
  let opened = false;
  let wide = false;
  let waiting = 0;

  const titleLine = createElement("span", { hidden: true });
  const widthToggle = iconButton("chat-window-icon");
  const collapse = iconButton("chat-window-icon");
  collapse.setAttribute("aria-controls", panelId);
  collapse.append(lucideIcon("chevron-down", 14));
  const bar = createElement("header", { className: "chat-window-bar" }, [
    createElement("span", { className: "chat-window-mark", attrs: { "aria-hidden": "true" } }, [lucideIcon("messages-square", 14)]),
    createElement("div", { className: "chat-window-heading" }, [createElement("strong", { text: "FluxIQ" }), titleLine]),
    widthToggle,
    collapse
  ]);
  const panel = createElement("div", {
    id: panelId,
    className: "chat-window-panel",
    hidden: true,
    attrs: { role: "dialog", "aria-label": options.ariaLabel ?? "FluxIQ conversation", tabindex: "-1", "data-wide": "false" }
  }, [bar, chat.element]);

  const launcherLabel = createElement("span");
  const badge = createElement("span", { className: "chat-window-badge", hidden: true });
  const launcher = createElement("button", {
    className: "chat-window-launcher",
    attrs: { type: "button", "aria-controls": panelId }
  }, [lucideIcon("messages-square", 17), launcherLabel, badge]);
  const element = createElement("div", { className: "chat-window", attrs: { "data-open": "false" } }, [panel, launcher]);

  function drawLauncher(): void {
    const label = conversationLauncherLabel(opened, waiting);
    launcher.setAttribute("aria-label", label);
    launcher.setAttribute("title", label);
    launcher.setAttribute("aria-expanded", String(opened));
    launcher.setAttribute("data-waiting", waiting > 0 ? "true" : "false");
    launcherLabel.textContent = waiting > 0 ? "Needs you" : "FluxIQ";
    badge.textContent = waiting > 0 ? String(waiting) : "";
    badge.hidden = waiting <= 0;
  }

  function drawWidth(): void {
    const label = wide ? "Make the conversation narrower" : "Make the conversation wider";
    widthToggle.setAttribute("aria-label", label);
    widthToggle.setAttribute("title", wide ? "Narrower" : "Wider");
    widthToggle.replaceChildren(lucideIcon(wide ? "minimize-2" : "maximize-2", 14));
    panel.setAttribute("data-wide", String(wide));
  }

  function drawCollapse(): void {
    collapse.setAttribute("aria-expanded", String(opened));
    collapse.setAttribute("aria-label", "Hide the conversation");
    collapse.setAttribute("title", "Hide the conversation (Esc)");
  }

  // A dialog opened from inside the chat takes Escape for itself; collapsing
  // the window under it would cancel the answer and hide the question in one key.
  function onKeyDown(event: KeyboardEvent): void {
    if (event.key !== "Escape" || options.escapeBlocked?.() === true) return;
    close();
  }

  function open(): void {
    if (opened) return;
    opened = true;
    panel.hidden = false;
    element.setAttribute("data-open", "true");
    drawLauncher();
    drawCollapse();
    chat.setBackground(false);
    document.addEventListener("keydown", onKeyDown);
    panel.focus();
  }

  function close(): void {
    if (!opened) return;
    opened = false;
    panel.hidden = true;
    element.setAttribute("data-open", "false");
    drawLauncher();
    drawCollapse();
    chat.setBackground(true);
    document.removeEventListener("keydown", onKeyDown);
    launcher.focus();
  }

  launcher.addEventListener("click", () => (opened ? close() : open()));
  collapse.addEventListener("click", close);
  widthToggle.addEventListener("click", () => {
    wide = !wide;
    drawWidth();
  });
  drawLauncher();
  drawWidth();
  drawCollapse();
  chat.setBackground(true);

  return {
    element,
    setWaiting(count) {
      waiting = Math.max(0, Math.floor(count));
      drawLauncher();
    },
    setTitle(title) {
      const text = title.trim();
      titleLine.textContent = text;
      titleLine.setAttribute("title", text);
      titleLine.hidden = text === "";
    },
    open,
    close,
    isOpen: () => opened
  };
}
