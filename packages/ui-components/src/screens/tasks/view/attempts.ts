// The attempts of a task as a timeline, newest first: when, how it ended, how long and what
// it cost, the comparison with the one before, and its steps on request.

import { createElement } from "../../../dom/index.ts";
import type { ChatTaskOutcome } from "../../../chat/ports/index.ts";
import { attemptEntry } from "../model/index.ts";
import { taskButton } from "./button.ts";
import type { StepsState } from "./state.ts";
import { stepsView } from "./steps.ts";

export type AttemptsHost = {
  nowMs: number;
  reportsSpend: boolean;
  /** Steps can be shown at all: the port reads them. */
  canShowSteps: boolean;
  steps: ReadonlyMap<string, StepsState>;
  toggleSteps(attemptId: string): void;
  retrySteps(attemptId: string): void;
  toggleQuiet(attemptId: string): void;
};

/** The timeline section. */
export function attemptsView(attempts: readonly ChatTaskOutcome[], host: AttemptsHost): HTMLElement {
  const items = attempts.map((outcome) => {
    const entry = attemptEntry(outcome, { nowMs: host.nowMs, reportsSpend: host.reportsSpend });
    const state = host.steps.get(entry.attemptId);
    const ended = createElement("span", { className: "attempt-ended", attrs: { "data-tone": entry.state.tone } });
    if (entry.state.mark === "tick") ended.append(createElement("span", { className: "task-row-mark", text: "✓", attrs: { "aria-hidden": "true" } }));
    ended.append(createElement("span", { text: entry.state.words }));
    const head = createElement("p", { className: "attempt-head" }, [createElement("span", { className: "attempt-when", text: entry.when }), ended]);
    const item = createElement("li", { className: "attempt-item", attrs: { "data-attempt-id": entry.attemptId } }, [head]);
    if (entry.took !== "") item.append(createElement("p", { className: "attempt-took", text: entry.took }));
    if (entry.compared !== undefined) item.append(createElement("p", { className: "attempt-compared", text: entry.compared }));
    if (host.canShowSteps) {
      const open = state?.open === true;
      item.append(taskButton(open ? "Hide steps" : "Show steps", `steps:${entry.attemptId}`, () => host.toggleSteps(entry.attemptId), { expanded: open, name: `${open ? "Hide" : "Show"} the steps of the attempt ${entry.when}` }));
      if (open && state !== undefined) item.append(stepsView(state, { retry: () => host.retrySteps(entry.attemptId), toggleQuiet: () => host.toggleQuiet(entry.attemptId) }));
    }
    return item;
  });
  return createElement("section", { className: "tasks-attempts", attrs: { "aria-labelledby": "tasks-attempts-heading" } }, [
    createElement("h3", { id: "tasks-attempts-heading", className: "tasks-section-heading", text: attempts.length === 1 ? "This attempt" : "Attempts" }),
    createElement("ol", { className: "attempts-list" }, items)
  ]);
}
