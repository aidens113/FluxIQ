// The notice for something that went wrong after Core took a send or an
// answer (`state.notice`): one quiet line beside the read notice, hidden when
// there is nothing to say.

import { createElement } from "../../dom/index.ts";

/** The mounted line. */
export type NoticeLine = {
  readonly element: HTMLElement;
  /** Says `text`; undefined hides the line. */
  update(text: string | undefined): void;
};

/** Creates it, hidden. */
export function createNoticeLine(): NoticeLine {
  const element = createElement("p", { className: "notice", hidden: true, attrs: { role: "status" } });
  return {
    element,
    update(text) {
      const words = text ?? "";
      if (element.textContent !== words) element.textContent = words;
      if (element.hidden !== (text === undefined)) element.hidden = text === undefined;
    }
  };
}
