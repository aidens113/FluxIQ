// The live line: the last entry of the chat while FluxIQ works, a pulsing
// dot, the headline, the step and Core's latest sentence ("Thinking about the
// next step" while Core decides). The steps themselves are messages above it.
// It is one element for the chat's whole life, updated
// in place and hidden between units of work, so the status never remounts or
// flickers; a turn that arrives is placed before it, which is how the turn
// takes its place. While the work waits on a question held in another thread,
// one button under the words opens that thread (`onAction`).

import { createElement } from "../../dom/index.ts";
import type { LiveLineModel } from "./live-line-model.ts";

/** The mounted live line. */
export type LiveLine = {
  readonly element: HTMLElement;
  update(model: LiveLineModel | null): void;
};

/** Creates the live line, hidden; `onAction` hears its button. */
export function createLiveLine(onAction: () => void = () => undefined): LiveLine {
  const headline = createElement("span", { className: "chat-live-headline" });
  const step = createElement("span", { className: "chat-live-step" });
  const detail = createElement("span", { className: "chat-live-detail" });
  const action = createElement("button", { className: "chat-live-action", hidden: true, attrs: { type: "button" } });
  action.addEventListener("click", () => onAction());
  const element = createElement("li", { className: "chat-entry chat-live", hidden: true, attrs: { "aria-live": "polite", "aria-atomic": "false" } }, [
    createElement("div", { className: "chat-live-status" }, [
      createElement("span", { className: "chat-live-dot", attrs: { "aria-hidden": "true" } }),
      createElement("div", { className: "chat-live-copy" }, [
        createElement("div", { className: "chat-live-head" }, [headline, step]),
        detail,
        action
      ])
    ])
  ]);
  return {
    element,
    update(model) {
      const hidden = model === null;
      if (element.hidden !== hidden) element.hidden = hidden;
      if (model === null) return;
      const state = model.waiting ? "waiting" : "working";
      if (element.getAttribute("data-state") !== state) element.setAttribute("data-state", state);
      setText(headline, model.headline);
      setText(step, model.step);
      setText(detail, model.detail);
      if (step.hidden !== (model.step === "")) step.hidden = model.step === "";
      if (detail.hidden !== (model.detail === "")) detail.hidden = model.detail === "";
      setText(action, model.action);
      if (action.hidden !== (model.action === "")) action.hidden = model.action === "";
    }
  };
}

function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}
