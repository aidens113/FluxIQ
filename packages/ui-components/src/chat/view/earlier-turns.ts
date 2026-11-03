// "Show 12 earlier turns": the one control above a thread that has turns the
// chat is not showing (it keeps a window of the newest). Pressing it reads the
// thread from its start. The words say how many when that is known.

import { createElement } from "../../dom/index.ts";

/** The mounted control. */
export type EarlierTurns = {
  readonly element: HTMLElement;
  /** Shows it while there are earlier turns, saying how many when `count` is known. */
  update(earlier: boolean, count: number | undefined): void;
};

/** What the button says. */
function earlierTurnsWords(count: number | undefined): string {
  if (count === undefined) return "Show earlier turns";
  return `Show ${count} earlier turn${count === 1 ? "" : "s"}`;
}

/** Creates the control; `show` is called when the person presses it. */
export function createEarlierTurns(show: () => void): EarlierTurns {
  const button = createElement("button", { className: "chat-earlier-button", attrs: { type: "button" } });
  const element = createElement("div", { className: "chat-earlier", hidden: true }, [button]);
  button.addEventListener("click", show);
  return {
    element,
    update(earlier, count) {
      if (element.hidden === earlier) element.hidden = !earlier;
      const words = earlierTurnsWords(count);
      if (button.textContent !== words) button.textContent = words;
    }
  };
}
