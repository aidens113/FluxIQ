// The empty chat, centred in the stream: a title, one line, the latest
// chat's two starts as buttons, the model-key line with its Open FluxIQ, and
// example prompts as quiet buttons that fill the composer when chosen. Built
// once; the starts and examples are rebuilt only when their set changes.

import { createElement } from "../../dom/index.ts";
import type { EmptyStart, EmptyStateModel } from "./empty-state-model.ts";
import { placeChildren } from "./place-children.ts";

/** The mounted empty state. */
export type EmptyState = {
  readonly element: HTMLElement;
  /** Shows `model`, or hides when it is null or `covered` (something else is on screen). */
  update(model: EmptyStateModel | null, covered: boolean): void;
};

/** What the empty state hands back to the chat beyond an example's text. */
export type EmptyStateHooks = {
  /** Receives a start the person pressed. */
  start?: (start: EmptyStart["id"]) => void;
  /** The control shown after the model-key line (the chat's Open FluxIQ); moved in only while the line shows. */
  keyAction?: HTMLElement;
};

/** Creates it; `choose` receives an example the person picked. */
export function createEmptyState(choose: (text: string) => void, hooks: EmptyStateHooks = {}): EmptyState {
  const title = createElement("p", { className: "chat-empty-title" });
  const line = createElement("p", { className: "chat-empty-line" });
  const starts = createElement("div", { className: "chat-starts", attrs: { role: "group", "aria-label": "Start" } });
  const keyText = createElement("span", { className: "chat-key-text" });
  const key = createElement("div", { className: "chat-key-line", hidden: true, attrs: { role: "status" } }, [keyText]);
  const examples = createElement("div", { className: "chat-examples", attrs: { role: "list", "aria-label": "Examples" } });
  const element = createElement("div", { className: "chat-empty", hidden: true }, [title, line, starts, key, examples]);
  let shownStarts = "";
  let shownExamples = "";
  return {
    element,
    update(model, covered) {
      const hidden = model === null || covered;
      if (element.hidden !== hidden) element.hidden = hidden;
      if (model === null) return;
      if (title.textContent !== model.title) title.textContent = model.title;
      if (title.hidden !== (model.title === "")) title.hidden = model.title === "";
      if (line.textContent !== model.line) line.textContent = model.line;
      const onboarding = model.starts.length > 0;
      if ((element.getAttribute("data-onboarding") !== null) !== onboarding) {
        if (onboarding) element.setAttribute("data-onboarding", ""); else element.removeAttribute("data-onboarding");
      }
      const keyHidden = model.keyLine === null;
      if (key.hidden !== keyHidden) key.hidden = keyHidden;
      if (keyText.textContent !== (model.keyLine ?? "")) keyText.textContent = model.keyLine ?? "";
      const action = hooks.keyAction;
      if (action !== undefined && keyHidden && action.parentNode === key) action.remove();
      else if (action !== undefined && !keyHidden && action.parentNode !== key) key.append(action);
      const startSignature = model.starts.map((start) => `${start.id}:${start.label}`).join("\u0000");
      if (startSignature !== shownStarts) {
        shownStarts = startSignature;
        placeChildren(starts, model.starts.map((start) => {
          const button = createElement("button", {
            className: start.id === "describe" ? "chat-start chat-start-primary" : "chat-start",
            text: start.label,
            attrs: { type: "button", "data-start": start.id }
          });
          button.addEventListener("click", () => hooks.start?.(start.id));
          return button;
        }));
      }
      const signature = model.examples.join("\u0000");
      if (signature === shownExamples) return;
      shownExamples = signature;
      placeChildren(examples, model.examples.map((text) => {
        const button = createElement("button", { className: "chat-example", text, attrs: { type: "button", role: "listitem" } });
        button.addEventListener("click", () => choose(text));
        return button;
      }));
    }
  };
}
