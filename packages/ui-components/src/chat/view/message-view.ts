// One turn of the conversation, the way a chat shows it:
//
//   the person    a bubble on the right, their words as typed; a message
//                 the panel could not send says why under them
//   FluxIQ        full width on the left, no bubble: its words formatted
//                 (`parseAssistantText`) and a question's answer controls
//
// A turn's attachment is not shown. Every one Core writes is its own record of
// a command it ran or will run, which the turn's words already say -- Core's
// panel draws none -- and the line that stood for it, "FluxIQ attached
// something you can see in FluxIQ. Open FluxIQ", named nothing (t195,
// `run-murdouox-c5294247`, 09-failure-panel).
//
// The work that led to an answer is not folded into it: each step is its own
// message before it (`step-message-view.ts`).
//
// The element lives as long as the turn. Its words and controls are rebuilt
// only when their `signature` changes, so a half-typed answer keeps its text
// and focus across every poll.

import { createElement } from "../../dom/index.ts";
import { askControls, type AskControlsContext, type CoreTurn } from "../conversation/index.ts";
import { parseAssistantText, renderTextBlocks } from "../format/index.ts";
import { placeChildren } from "./place-children.ts";

/** The mounted turn. */
export type MessageView = {
  readonly element: HTMLElement;
  /** Shows `turn`; rebuilds its words and controls only when `signature` differs from the last. */
  update(turn: CoreTurn, signature: string, ask: AskControlsContext): void;
};

/** Creates the view for a turn by `author` (`person` or anything else, which is FluxIQ). */
export function createMessageView(author: string): MessageView {
  const person = author === "person";
  const content = createElement("div", { className: person ? "chat-bubble" : "chat-answer" });
  const element = createElement("li", { className: "chat-entry chat-msg", attrs: { "data-author": person ? "person" : "fluxiq" } }, [content]);
  let shown: string | undefined;
  return {
    element,
    update(turn, signature, ask) {
      if (signature === shown) return;
      shown = signature;
      const parts: HTMLElement[] = person
        ? [createElement("p", { className: "chat-bubble-text", text: turn.text })]
        : renderTextBlocks(parseAssistantText(turn.text));
      // A message this panel could not send says so on the turn itself.
      if (turn.sendError !== undefined) parts.push(createElement("p", { className: "chat-send-error", text: turn.sendError, attrs: { role: "alert" } }));
      if (turn.ask !== null) parts.push(askControls(turn.ask, ask));
      placeChildren(content, parts);
    }
  };
}
