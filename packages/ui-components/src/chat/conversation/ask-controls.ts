// A question FluxIQ asked, as controls under its turn: one button per answer,
// a text box for an open question, or a sentence when it is settled or can be
// answered only in FluxIQ (`askPresentation`). A failed answer is said here,
// beside the buttons that sent it. A pending question the host words itself
// (`context.presented`) is drawn by `presentedAskControls` instead; a settled
// one keeps the chat's own sentence either way.

import { createElement } from "../../dom/index.ts";
import type { ChatAskAction, ChatAskPresentation } from "../ports/index.ts";
import { presentedAskControls } from "./presented-ask.ts";
import { askPresentation } from "./ask-copy.ts";
import type { CoreAsk } from "./core-thread.ts";

/** What the controls need from the card. */
export type AskControlsContext = {
  answering: boolean;
  error: string | undefined;
  /** Answers. What it returns is the outcome (`AnswerOutcome`) when there is one, for a text box that empties itself once it went. */
  answer(kind: string, value?: string): unknown;
  /** An Open FluxIQ control, for a question this panel cannot answer. */
  openFluxIQ(): HTMLElement;
  /** The host's words for this question; null or absent: the chat's own controls. */
  presented?: ChatAskPresentation | null | undefined;
  /** Asks the host's dialog for the PIN before this action answers; absent where the host has none. */
  reauthorize?: ((action: ChatAskAction) => void) | undefined;
  /** Words typed in the text box, kept by the turn so a rebuild of the controls does not lose them. */
  draft?: { text: string } | undefined;
};

/** The controls for `ask`. */
export function askControls(ask: CoreAsk, context: AskControlsContext): HTMLElement {
  const presentation = askPresentation(ask);
  const children: HTMLElement[] = [];
  const hostWords = ask.status === "pending" && context.presented ? context.presented : null;
  if (hostWords !== null) children.push(...presentedAskControls(hostWords, context));
  else switch (presentation.state) {
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
