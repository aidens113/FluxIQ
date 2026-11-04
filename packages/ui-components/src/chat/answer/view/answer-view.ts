// The answer turn, mounted: one task attempt's result on FluxIQ's side of the chat.
//
//   Found 10 of 10                                  [tick] Checked
//   [ columns | first 5 rows ]                      Show all 10 · CSV · JSON
//   On the site: nothing changed
//   Checked: ...      From: pages on site · time · cost
//   Saved so next time is quicker.        [Run again] [What I did]
//
// The element lives as long as the attempt. The card inside is redrawn only when what it
// says changes (the model, or what the last press said), so a re-read that changes nothing
// changes nothing on screen, "Show all" stays open, and a focused button keeps its focus
// across a redraw. All text goes in through `textContent`.

import { createElement } from "../../../dom/index.ts";
import type { ChatTaskOutcome } from "../../ports/index.ts";
import type { AnswerHost } from "./host.ts";
import { answerBody } from "./body.ts";
import { answerFoot } from "./foot.ts";
import { answerHead } from "./head.ts";
import { createAnswerHandlers } from "./handlers.ts";
import { answerModel } from "../model/index.ts";
import type { AnswerState } from "./state.ts";
import type { AnswerModel } from "../model/index.ts";

/** The mounted answer turn. */
export type AnswerView = {
  readonly element: HTMLElement;
  /** Shows `outcome`. Answers false when it has no answer turn (still working), and the element should not be placed. */
  update(outcome: ChatTaskOutcome): boolean;
};

/** The `data-action` of the button that has focus inside `root`, to give it back after a redraw. */
function focusedAction(root: HTMLElement): string | null {
  const active = (globalThis as { document?: { activeElement?: unknown } }).document?.activeElement;
  for (const button of root.querySelectorAll("button")) if (button === active) return button.getAttribute("data-action");
  return null;
}

function refocus(root: HTMLElement, action: string | null): void {
  if (action === null) return;
  for (const button of root.querySelectorAll("button")) if (button.getAttribute("data-action") === action && !button.disabled) button.focus();
}

/** Creates the view for an answer turn; `host` carries the results port and the callbacks. */
export function createAnswerView(host: AnswerHost = {}): AnswerView {
  const card = createElement("div", { className: "answer-card", attrs: { role: "group", "aria-label": "Answer" } });
  const element = createElement("li", { className: "chat-entry answer-turn", attrs: { "data-author": "fluxiq" } }, [card]);
  const state: AnswerState = { expanded: false, busy: undefined, status: undefined };
  let model: AnswerModel | undefined;
  let drawn = "";
  const handlers = createAnswerHandlers({ host, model: () => model, state, redraw: () => draw() });

  function draw(): void {
    if (model === undefined) return;
    const signature = JSON.stringify([model, state]);
    if (signature === drawn) return;
    drawn = signature;
    const focus = focusedAction(card);
    const canExport = model.canExport && host.results !== undefined;
    card.replaceChildren(...answerHead(model), ...answerBody(model, state, handlers, canExport), ...answerFoot(model, state, host, handlers));
    element.setAttribute("data-kind", model.kind);
    element.setAttribute("data-attempt-id", model.attemptId);
    refocus(card, focus);
  }

  return {
    element,
    update(outcome) {
      model = answerModel(outcome, { reportsSpend: host.results?.reportsSpend !== false, canAddBudget: typeof host.results?.addBudgetAndCarryOn === "function", nowMs: (host.now ?? Date.now)() });
      draw();
      return model !== undefined;
    }
  };
}
