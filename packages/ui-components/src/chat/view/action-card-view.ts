// One action FluxIQ took, as a card in the chat: its icon in a round mark
// tinted by how it went, Core's short name for the kind and what it acted on
// on one line, and how it went in words on the next.
//
//   ( icon )  Click · Get a free quote
//             Didn't work: it wasn't on the page
//
// A target is one line, cut at the end by the stylesheet as a last resort,
// except one the words mark `whole` (Core's name for a list, which is never
// cut or renamed: R2-U-8), which wraps at its spaces.
//
// The card is a labelled group: its accessible name says the kind, the
// target and the outcome, and the icon is hidden. The element lives as long
// as the card; an update changes only the words and marks that changed (the
// icon too, when Core's reading of the kind changes as the action ends), so
// a card never remounts or flickers. Text goes in through `textContent` only.

import { ACTIVITY_ACTION_ICONS } from "fluxiq/ui";
import { createElement } from "../../dom/index.ts";
import { lucideIcon } from "../../icons/index.ts";
import { cardWords, type ActionCard } from "../stream/index.ts";

/** The mounted card. */
export type ActionCardView = {
  readonly element: HTMLElement;
  /** Shows `card`; `current` is true while it is the action of the moment. */
  update(card: ActionCard, current: boolean): void;
};

/** Creates an empty card. */
export function createActionCardView(): ActionCardView {
  const mark = createElement("span", { className: "chat-card-mark", attrs: { "aria-hidden": "true" } });
  const name = createElement("span", { className: "chat-card-name" });
  const target = createElement("span", { className: "chat-card-target" });
  const head = createElement("span", { className: "chat-card-head" }, [name, target]);
  const outcome = createElement("span", { className: "chat-card-outcome" });
  const body = createElement("span", { className: "chat-card-body" }, [head, outcome]);
  const element = createElement("div", { className: "chat-card", attrs: { role: "group" } }, [mark, body]);
  let icon = "";

  return {
    element,
    update(card, current) {
      const words = cardWords(card, current);
      const named = ACTIVITY_ACTION_ICONS[card.kind] ?? ACTIVITY_ACTION_ICONS.other;
      if (named !== icon) {
        icon = named;
        mark.textContent = "";
        mark.append(lucideIcon(named));
      }
      setAttr(element, "data-kind", card.kind);
      setAttr(element, "data-state", words.state);
      setAttr(element, "aria-label", words.label);
      setText(name, words.name);
      setText(target, words.target ?? "");
      setHidden(target, words.target === null);
      // A target shown whole wraps at its spaces rather than being cut (`chat.css`).
      setAttr(target, "data-whole", words.whole ? "true" : "false");
      setText(outcome, words.outcome ?? "");
      setHidden(outcome, words.outcome === null);
    }
  };
}

function setText(node: HTMLElement, value: string): void {
  if (node.textContent !== value) node.textContent = value;
}

function setHidden(node: HTMLElement, hidden: boolean): void {
  if (node.hidden !== hidden) node.hidden = hidden;
}

function setAttr(node: HTMLElement, name: string, value: string): void {
  if (node.getAttribute(name) !== value) node.setAttribute(name, value);
}
