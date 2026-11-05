// What the tasks screen is holding, for its views to draw. The screen changes it and redraws;
// a view never changes it.

import type { ChatTaskOutcome } from "../../../chat/ports/index.ts";
import type { ChatAttemptProvenance } from "../../../chat/ports/index.ts";
import type { TaskStep, TaskSummary } from "../port.ts";

/** The list: what was read, what the search says, and the last failed read (kept beside what was on screen). */
export type ListState = {
  status: "idle" | "loading" | "ready";
  tasks: readonly TaskSummary[];
  nextCursor: string | null;
  text: string;
  error?: string;
  /** Said once after something changed (a task deleted). */
  note?: string;
  loadingMore: boolean;
};

/** One attempt's steps: read when asked, drawn open or closed. */
export type StepsState = {
  status: "loading" | "ready" | "failed";
  steps: readonly TaskStep[];
  provenance?: ChatAttemptProvenance;
  error?: string;
  open: boolean;
  quietOpen: boolean;
};

export type RenameState = { draft: string; busy: boolean; error?: string };
export type DeleteState = { busy: boolean; error?: string };

/** An open task. `task` is absent until its first read answers. */
export type DetailsState = {
  taskId: string;
  task?: TaskSummary;
  attempts: readonly ChatTaskOutcome[];
  status: "loading" | "ready" | "failed";
  error?: string;
  steps: ReadonlyMap<string, StepsState>;
  renaming?: RenameState;
  deleting?: DeleteState;
  carrying: boolean;
  /** "Save this" for the task's Flow, once a subflow worth keeping is known. Built once so a press and what it said stay across redraws. */
  keep?: HTMLElement;
  note?: { text: string; tone: "info" | "error" };
};
