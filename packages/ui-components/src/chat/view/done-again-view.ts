// Steps done again, as one line in the chat: a disclosure that reads "Did 3
// earlier steps again: Accept all, 7-in-1 and Spain" and opens to show each
// step's card as it was (`../stream/step/done-again.ts`, D7 of the t342 round
// 2 UI review). Closed until the person opens it; a render never closes it,
// adds the newest step's card after the others, and remounts nothing. Text goes
// in through `textContent` only.

import { createElement } from "../../dom/index.ts";
import { doneAgainWords, type ActionCard } from "../stream/index.ts";
import { createActionCardView, type ActionCardView } from "./action-card-view.ts";
import { placeChildren } from "./place-children.ts";

/** The mounted line. */
export type DoneAgainView = {
  readonly element: HTMLElement;
  /** Shows `card`, which holds the steps done again in `card.again`. */
  update(card: ActionCard): void;
};

/** Creates an empty line. */
export function createDoneAgainView(): DoneAgainView {
  const summary = createElement("summary", { className: "chat-again-summary" });
  const list = createElement("div", { className: "chat-again-cards chat-cards" });
  const element = createElement("details", { className: "chat-again" }, [summary, list]);
  const views = new Map<string, ActionCardView>();
  return {
    element,
    update(card) {
      const steps = card.again ?? [card];
      const words = doneAgainWords(steps);
      if (summary.textContent !== words) summary.textContent = words;
      const shown = steps.map((step) => {
        let view = views.get(step.key);
        if (view === undefined) {
          view = createActionCardView();
          views.set(step.key, view);
        }
        view.update(step, false);
        return view.element;
      });
      const keys = new Set(steps.map((step) => step.key));
      for (const key of [...views.keys()]) if (!keys.has(key)) views.delete(key);
      placeChildren(list, shown);
    }
  };
}
