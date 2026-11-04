// An attempt's steps, each with its reasoning. Small steps are folded behind one control, and
// a heading ("From saved steps", "Worked out again") appears only where the kind changes.

import { createElement } from "../../../dom/index.ts";
import { quietWords, stepRuns, type StepEntry } from "../model/index.ts";
import { taskButton } from "./button.ts";
import type { StepsState } from "./state.ts";

export type StepsHost = { retry(): void; toggleQuiet(): void };

function entryView(entry: StepEntry): HTMLElement {
  const item = createElement("li", { className: "step-item" });
  if (entry.heading !== undefined) item.append(createElement("p", { className: "step-kind", text: entry.heading }));
  const title = createElement("p", { className: "step-title" }, [createElement("span", { text: entry.title })]);
  if (entry.time !== undefined) title.append(createElement("span", { className: "step-time", text: entry.time }));
  item.append(title);
  if (entry.reason !== undefined) item.append(createElement("p", { className: "step-reason", text: entry.reason }));
  if (entry.result !== undefined) item.append(createElement("p", { className: "step-result", text: entry.result }));
  return item;
}

/** The steps area for `state`, under one attempt. */
export function stepsView(state: StepsState, host: StepsHost): HTMLElement {
  const area = createElement("div", { className: "steps-area" });
  if (state.status === "loading") {
    area.append(createElement("p", { className: "tasks-line", text: "Loading the steps..." }));
    return area;
  }
  if (state.status === "failed") {
    area.append(createElement("div", { className: "tasks-notice", attrs: { role: "status" } }, [
      createElement("p", { className: "tasks-notice-text", text: state.error ?? "The steps could not be loaded just now." }),
      taskButton("Try again", "steps-retry", host.retry)
    ]));
    return area;
  }
  const runs = stepRuns(state.steps, state.provenance);
  if (runs.length === 0) {
    area.append(createElement("p", { className: "tasks-line", text: "No steps were kept for this attempt." }));
    return area;
  }
  const list = createElement("ol", { className: "steps-list" });
  for (const run of runs) {
    if (run.kind === "step") {
      list.append(entryView(run.entry));
      continue;
    }
    const folded = createElement("li", { className: "step-quiet" });
    folded.append(taskButton(state.quietOpen ? "Hide small steps" : quietWords(run.entries.length), `quiet:${run.entries[0]!.stepId}`, host.toggleQuiet, { expanded: state.quietOpen, name: state.quietOpen ? "Hide small steps" : `Show ${quietWords(run.entries.length)}` }));
    if (state.quietOpen) folded.append(createElement("ol", { className: "steps-list steps-quiet-list" }, run.entries.map(entryView)));
    list.append(folded);
  }
  area.append(list);
  return area;
}
