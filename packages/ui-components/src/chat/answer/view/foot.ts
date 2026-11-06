// The foot of an answer: what is saved, and what the person can do next. Each action is
// drawn only where the host or the port can carry it; the host's callbacks are the host's
// to answer, and the answer turn never calls the runs port.

import { createElement } from "../../../dom/index.ts";
import type { AnswerHost } from "./host.ts";
import { answerButton } from "./button.ts";
import type { AnswerHandlers, AnswerState } from "./state.ts";
import type { AnswerModel } from "../model/index.ts";

function buttons(model: AnswerModel, state: AnswerState, host: AnswerHost, handlers: AnswerHandlers): HTMLElement[] {
  const made: HTMLElement[] = [];
  if (model.addBudget !== undefined) made.push(answerButton(model.addBudget.words, "add-budget", handlers.addBudget, { tone: "primary", disabled: state.busy === "budget" }));
  if (model.carryOn !== undefined && host.results?.addBudgetAndCarryOn !== undefined) made.push(answerButton(model.carryOn.words, "carry-on", handlers.carryOn, { tone: "primary", disabled: state.busy === "budget" }));
  if (model.stuckActions) {
    if (host.onKeepGoing !== undefined) made.push(answerButton("Keep going", "keep-going", handlers.keepGoing, { tone: "primary", disabled: state.busy === "budget" }));
    if (host.onTellMore !== undefined) made.push(answerButton("Tell it more", "tell-more", handlers.tellMore));
    if (host.onStop !== undefined) made.push(answerButton("Stop", "stop", handlers.stop));
  }
  if (model.canRunAgain && host.results !== undefined) made.push(answerButton("Run again", "run-again", handlers.runAgain, { disabled: state.busy === "run_again" }));
  if (host.onWhatIDid !== undefined) made.push(answerButton("What I did", "what-i-did", handlers.whatIDid));
  return made;
}

/** The saved line, the buttons and the line that says what the last press did. */
export function answerFoot(model: AnswerModel, state: AnswerState, host: AnswerHost, handlers: AnswerHandlers): HTMLElement[] {
  const foot: HTMLElement[] = [];
  if (model.saved !== undefined) foot.push(createElement("p", { className: "answer-saved", text: model.saved }));
  const actions = buttons(model, state, host, handlers);
  if (model.runAgainNote !== undefined && model.canRunAgain && host.results !== undefined) foot.push(createElement("p", { className: "answer-again-note", text: model.runAgainNote }));
  if (actions.length > 0) foot.push(createElement("div", { className: "answer-buttons" }, actions));
  if (state.status !== undefined) foot.push(createElement("p", { className: "answer-status", text: state.status.text, attrs: { role: state.status.tone === "error" ? "alert" : "status", "data-tone": state.status.tone } }));
  return foot;
}
