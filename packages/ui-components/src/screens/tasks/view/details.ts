// An open task, inside the tab: a way back, its name, where it got to in a sentence, the
// action that fits, the latest answer drawn by the answer turn's own view, and the attempts.
// Add budget and Run again are the answer view's buttons (it says the amount and the note
// itself); Carry on and Open in chat are drawn here.

import { createElement } from "../../../dom/index.ts";
import type { ChatTaskOutcome } from "../../../chat/ports/index.ts";
import { ownWaitingWords, taskState, waitingReason, whereItGotTo, type TaskActions } from "../model/index.ts";
import type { TaskSummary } from "../port.ts";
import { attemptsView, type AttemptsHost } from "./attempts.ts";
import { taskButton } from "./button.ts";
import { confirmDeleteView, type ConfirmDeleteHost } from "./confirm-delete.ts";
import type { DetailsState } from "./state.ts";
import { titleView, type TitleHost } from "./title.ts";

export type DetailsHost = AttemptsHost & {
  back(): void;
  retry(): void;
  actions(task: TaskSummary, latest: ChatTaskOutcome): TaskActions;
  /** The answer view's element for the newest attempt, where it has an answer. */
  answer: HTMLElement | undefined;
  title: TitleHost;
  confirm: ConfirmDeleteHost;
  startRename(): void;
  askDelete(): void;
  carryOn(): void;
  openInChat(): void;
};

function nav(host: DetailsHost, actions: TaskActions | undefined, state: DetailsState): HTMLElement {
  const back = taskButton("← Back", "back", host.back, { name: "Back to tasks" });
  const more: HTMLElement[] = [];
  if (actions?.rename === true && state.renaming === undefined) more.push(taskButton("Rename", "rename", host.startRename));
  if (actions?.remove === true && state.deleting === undefined) more.push(taskButton("Delete", "delete", host.askDelete));
  return createElement("div", { className: "tasks-nav" }, [back, createElement("div", { className: "tasks-buttons" }, more)]);
}

function summary(latest: ChatTaskOutcome, state: DetailsState): HTMLElement[] {
  const steps = state.steps.get(latest.attempt.attemptId);
  const status = taskState(latest);
  const stateLine = createElement("p", { className: "task-state", attrs: { "data-tone": status.tone } });
  if (status.mark === "tick") stateLine.append(createElement("span", { className: "task-row-mark", text: "✓", attrs: { "aria-hidden": "true" } }));
  stateLine.append(createElement("span", { text: status.words }));
  const progress = whereItGotTo(latest.attempt, steps?.status === "ready" ? steps.steps : undefined);
  return [stateLine, createElement("p", { className: "task-progress", text: progress })];
}

function actionRow(actions: TaskActions, state: DetailsState, host: DetailsHost): HTMLElement | undefined {
  const buttons: HTMLElement[] = [];
  if (actions.carryOn) buttons.push(taskButton(state.carrying ? "Carrying on..." : "Carry on", "carry-on", host.carryOn, { tone: "primary", disabled: state.carrying }));
  if (actions.openInChat) buttons.push(taskButton("Open in chat", "open-in-chat", host.openInChat));
  return buttons.length === 0 ? undefined : createElement("div", { className: "tasks-buttons task-actions" }, buttons);
}

function ownWait(latest: ChatTaskOutcome): HTMLElement | undefined {
  const reason = waitingReason(latest.attempt);
  const words = reason === undefined ? undefined : ownWaitingWords(reason);
  if (words === undefined) return undefined;
  return createElement("div", { className: "tasks-wait", attrs: { role: "group", "aria-label": words.headline } }, [
    createElement("p", { className: "tasks-line", text: words.lead })
  ]);
}

/** The whole details area for `state`. */
export function detailsView(state: DetailsState, host: DetailsHost): HTMLElement[] {
  const task = state.task;
  if (task === undefined) {
    const body: HTMLElement[] = [nav(host, undefined, state)];
    if (state.status === "failed") {
      body.push(createElement("div", { className: "tasks-notice", attrs: { role: "status" } }, [
        createElement("p", { className: "tasks-notice-text", text: state.error ?? "This task could not be loaded just now." }),
        taskButton("Try again", "details-retry", host.retry)
      ]));
    } else body.push(createElement("p", { className: "tasks-line", text: "Loading this task..." }));
    return body;
  }
  const latest = state.attempts[0] ?? task.latest;
  const actions = host.actions(task, latest);
  const body: HTMLElement[] = [nav(host, actions, state), titleView(task.title.trim() === "" ? "Untitled task" : task.title, state.renaming, host.title)];
  if (state.deleting !== undefined) body.push(confirmDeleteView(task.title, state.deleting, host.confirm));
  body.push(...summary(latest, state));
  const row = actionRow(actions, state, host);
  if (row !== undefined) body.push(row);
  if (state.keep !== undefined) body.push(state.keep);
  if (state.status === "failed") {
    body.push(createElement("div", { className: "tasks-notice", attrs: { role: "status" } }, [
      createElement("p", { className: "tasks-notice-text", text: state.error ?? "This task could not be refreshed just now." }),
      taskButton("Try again", "details-retry", host.retry)
    ]));
  }
  if (state.note !== undefined) body.push(createElement("p", { className: state.note.tone === "error" ? "tasks-error" : "tasks-line", text: state.note.text, attrs: { role: state.note.tone === "error" ? "alert" : "status" } }));
  const wait = ownWait(latest);
  if (wait !== undefined) body.push(wait);
  if (host.answer !== undefined && wait === undefined) body.push(createElement("ul", { className: "tasks-answer" }, [host.answer]));
  body.push(attemptsView(state.attempts.length > 0 ? state.attempts : [latest], host));
  return body;
}
