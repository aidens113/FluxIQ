// "FluxIQ stopped here and is waiting on your answer." over the transcript,
// with Show me, while a turn holds a question the person still owes an answer
// to. It only says so and asks the chat to show it: scrolling is
// `show-turn.ts`.

import { createElement } from "../../dom/index.ts";
import { lucideIcon } from "../../icons/index.ts";

/** The mounted banner. */
export type PendingBanner = {
  readonly element: HTMLElement;
  /** Shows the banner when `turnId` names the turn waiting on the person; undefined hides it. */
  update(turnId: string | undefined): void;
};

/** Creates it, hidden; `show` hears Show me with the turn it is for. */
export function createPendingBanner(show: (turnId: string) => void): PendingBanner {
  const button = createElement("button", { className: "small-button", text: "Show me", attrs: { type: "button" } });
  const element = createElement("div", { className: "chat-pending", hidden: true, attrs: { role: "status" } }, [
    lucideIcon("triangle-alert", 14),
    createElement("span", { className: "chat-pending-words", text: "FluxIQ stopped here and is waiting on your answer." }),
    button
  ]);
  let waiting: string | undefined;
  button.addEventListener("click", () => {
    if (waiting !== undefined) show(waiting);
  });
  return {
    element,
    update(turnId) {
      waiting = turnId;
      if (element.hidden !== (turnId === undefined)) element.hidden = turnId === undefined;
    }
  };
}
