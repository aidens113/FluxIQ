// A question FluxIQ asked, as controls under its turn: one button per answer,
// a text box for an open question, or a sentence when it is settled or can be
// answered only in FluxIQ (`askPresentation`). A failed answer is said here,
// beside the buttons that sent it.

import { createElement } from "../../dom/index.ts";
import { askPresentation } from "./ask-copy.ts";
import type { CoreAsk } from "./core-thread.ts";

/** What the controls need from the card. */
export type AskControlsContext = {
  answering: boolean;
  error: string | undefined;
  answer(kind: string, value?: string): void;
  /** An Open FluxIQ control, for a question this panel cannot answer. */
  openFluxIQ(): HTMLElement;
};

/** The controls for `ask`. */
export function askControls(ask: CoreAsk, context: AskControlsContext): HTMLElement {
  const presentation = askPresentation(ask);
  const children: HTMLElement[] = [];
  switch (presentation.state) {
    case "settled":
      children.push(createElement("p", { className: "turn-note", text: presentation.sentence }));
      break;
    case "elsewhere":
      children.push(createElement("p", { className: "turn-note", text: presentation.sentence }), context.openFluxIQ());
      break;
    case "choices":
      children.push(createElement("div", { className: "card-actions" }, presentation.choices.map((choice) => {
        const button = createElement("button", { className: "small-button", text: choice.label, attrs: { type: "button" } });
        button.disabled = context.answering;
        button.addEventListener("click", () => context.answer(choice.kind, choice.value));
        return button;
      })));
      break;
    case "words": {
      const input = createElement("input", { className: "turn-answer", attrs: { type: "text", "aria-label": "Your answer" } });
      const send = createElement("button", { className: "small-button", text: "Answer", attrs: { type: "button" } });
      input.disabled = context.answering;
      send.disabled = context.answering;
      const submit = (): void => {
        if (input.value.trim() !== "") context.answer("text", input.value.trim());
      };
      send.addEventListener("click", submit);
      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" || event.defaultPrevented || event.isComposing || event.keyCode === 229
          || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        submit();
      });
      children.push(createElement("div", { className: "turn-answer-row" }, [input, send]));
      break;
    }
  }
  if (context.error !== undefined) children.push(createElement("p", { className: "notice", text: context.error, attrs: { role: "status" } }));
  return createElement("div", { className: "turn-ask" }, children);
}
