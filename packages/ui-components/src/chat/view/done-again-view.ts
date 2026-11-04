// Steps done again, as one quiet line in the chat: "Did 3 earlier steps
// again: Accept all, 7-in-1 and Spain" (`../stream/step/done-again.ts`).
//
// Each of those steps was already told once, as its own message with its
// reason, where it happened; doing it again before a retry is routine, so the
// chat says that it happened and does not tell the steps a second time. It was
// a closed dropdown that opened to show every card again (D7 of the t342 round
// 2 UI review), which both told each step twice and hid steps behind a click.
// The line is plain text in the neutral look, never a count that stands in for
// a step: the steps themselves stay where they were told. The element lives as
// long as the line; text goes in through `textContent` only.

import { createElement } from "../../dom/index.ts";
import { doneAgainWords, type ActionCard } from "../stream/index.ts";

/** The mounted line. */
export type DoneAgainView = {
  readonly element: HTMLElement;
  /** Shows `card`, which holds the steps done again in `card.again`. */
  update(card: ActionCard): void;
};

/** Creates an empty line. */
export function createDoneAgainView(): DoneAgainView {
  const element = createElement("p", { className: "chat-again" });
  return {
    element,
    update(card) {
      const words = doneAgainWords(card.again ?? [card]);
      if (element.textContent !== words) element.textContent = words;
    }
  };
}
