// The top of an answer: what it is, and whether it was checked. A tick shows only for a
// confirmed result: an unconfirmed one has no mark and says why, a refuted one a failed mark.

import { createElement } from "../../../dom/index.ts";
import type { AnswerModel } from "../model/index.ts";

const MARKS = { tick: "✓", cross: "✕" } as const;

/** The headline, its check and the sentence that follows. */
export function answerHead(model: AnswerModel): HTMLElement[] {
  const head = createElement("div", { className: "answer-head" }, [createElement("p", { className: "answer-headline", text: model.headline })]);
  const { check } = model;
  if (check !== undefined) {
    const chip = createElement("p", { className: "answer-check", attrs: { "data-state": check.state } });
    if (check.mark !== "none") chip.append(createElement("span", { className: "answer-mark", text: MARKS[check.mark], attrs: { "aria-hidden": "true" } }));
    chip.append(createElement("span", { className: "answer-check-words", text: check.words }));
    head.append(chip);
  }
  const lines = [model.lead, model.gotLine].filter((line): line is string => line !== undefined);
  return [head, ...lines.map((line) => createElement("p", { className: "answer-lead", text: line }))];
}
