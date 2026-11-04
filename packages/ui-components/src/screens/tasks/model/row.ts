// A task as one row of the list: the person's words, its state, when it last ran and what
// that cost where the cost is real, and the saved line.

import { costWords, savedWords, timeWords } from "../../../chat/answer/words/index.ts";
import type { TaskSummary } from "../port.ts";
import { clockWords } from "./clock-words.ts";
import { taskState, type TaskState } from "./state.ts";

export type TaskRow = {
  taskId: string;
  title: string;
  state: TaskState;
  /** "14:05 · 3m 14s · $1.12 · 3 attempts", whatever of it is known. */
  line: string;
  saved?: string;
  updatedAtMs: number;
};

export type TaskRowOptions = { nowMs: number; reportsSpend: boolean };

/** `task` as a row. */
export function taskRow(task: TaskSummary, options: TaskRowOptions): TaskRow {
  const { attempt, saved } = task.latest;
  const parts = [
    clockWords(task.updatedAtMs),
    timeWords(attempt),
    attempt.status === "working" ? undefined : costWords(attempt, options.reportsSpend),
    task.attemptCount > 1 ? `${task.attemptCount} attempts` : undefined
  ];
  const row: TaskRow = {
    taskId: task.taskId,
    title: task.title.trim() === "" ? "Untitled task" : task.title,
    state: taskState(task.latest),
    line: parts.filter((part): part is string => part !== undefined).join(" · "),
    updatedAtMs: task.updatedAtMs
  };
  if (saved !== undefined) row.saved = savedWords(saved, options.nowMs);
  return row;
}
