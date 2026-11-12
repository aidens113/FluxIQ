// Reading a task's attempts back (t869). The records are `@fluxiq/contracts/automation`'s, and Core
// answers them through the contract's parsers. A client runs them through the same parsers again,
// so a record that fails is a failed read and never a guess.

import type { AutomationStudioSavedState, AutomationStudioTaskAttempt, AutomationStudioTaskResult } from "@fluxiq/contracts/automation";

/** Where an attempt's steps came from, in a person's words, from what the task remembers of it. */
export type AutomationStudioTaskOutcomeProvenance = {
  route: string;
  startedFrom: string;
  steps: { position: number; label: string; from: "saved" | "worked_out"; ran: boolean }[];
};

/**
 * Every way a replay of a saved Flow can deviate from the run a person accepted, which sends it to the
 * judge instead of standing on its record (task speed S9), in the order Core checks them
 * (`framework/.../answer-first/completion/replay-stands.ts` says what each means).
 */
export const AUTOMATION_STUDIO_TASK_REPLAY_DEVIATIONS = [
  "judge_always", "asked_again", "flow_not_proven", "flow_not_confirmed", "run_not_whole", "repaired", "step_failed", "step_routed",
  "act_not_done", "check_cleared", "step_retried", "shape_unknown", "shape_differs"
] as const;

export type AutomationStudioTaskReplayDeviation = (typeof AUTOMATION_STUDIO_TASK_REPLAY_DEVIATIONS)[number];

/**
 * How an attempt's replay of its saved Flow was checked (task speed S9, t897): it stood on its own record
 * with no judge call, or it deviated from the accepted run and was judged, for the closed reason named.
 */
export type AutomationStudioTaskOutcomeReplay = { stood: true } | { stood: false; deviation: AutomationStudioTaskReplayDeviation };

/** One attempt at a task and what goes with it. */
export type AutomationStudioTaskOutcome = {
  attempt: AutomationStudioTaskAttempt;
  /** The best so far while it works, and what it found once it has ended. */
  result?: AutomationStudioTaskResult;
  /** What it left saved. Absent where nothing was. */
  saved?: AutomationStudioSavedState;
  /** The latest earlier attempt at the same task on this Flow that ended. Absent on a first attempt. */
  comparedTo?: AutomationStudioTaskAttempt;
  /** How its steps came to be, where the task remembers the attempt. Absent where it does not. */
  provenance?: AutomationStudioTaskOutcomeProvenance;
  /** How its replay of the saved Flow was checked. Absent where it closed no replay: an exploration, a repair, a carry-on. */
  replay?: AutomationStudioTaskOutcomeReplay;
};

/** `get-task-attempt`. An attempt Core cannot find is refused, and so is a file it cannot read, in different words. */
export type GetTaskAttemptRequest = { projectId: string; attemptId: string };

export type GetTaskAttemptResponse = { outcome: AutomationStudioTaskOutcome };

/** `list-conversation-task-attempts`. None yet is an empty list, and a file Core cannot read is refused, never an empty list. */
export type ListConversationTaskAttemptsRequest = { projectId: string; conversationId: string };

export type ListConversationTaskAttemptsResponse = { outcomes: AutomationStudioTaskOutcome[] };

/** One task in a project's list: its latest attempt, and where it can be opened from. `title` is the person's own name for it, or its Flow's name. */
export type AutomationStudioProjectTask = {
  taskId: string;
  flowId: string;
  title?: string;
  /** The thread that holds the task's Flow now, for "open in chat". Absent where none is noted. */
  conversationId?: string;
  /** The task's own humanness level, 0-100, where it has one (`update-task-settings`). Absent: its runs take the Flow's level or the person's starting value. */
  humanness?: number;
  attemptCount: number;
  latest: AutomationStudioTaskOutcome;
};

/** `list-project-tasks`: a project's tasks, newest attempt first. A task whose latest attempt cannot be found is left out; a file Core cannot read is refused, never an empty list. */
export type ListProjectTasksRequest = { projectId: string; limit?: number; cursor?: string };

export type ListProjectTasksResponse = { tasks: AutomationStudioProjectTask[]; nextCursor: string | null };

/** `rename-task`: the task's own name only. A task Core does not hold is refused. Never touches a Flow, a saved part or a result. */
export type RenameTaskRequest = { projectId: string; taskId: string; title: string };

export type RenameTaskResponse = { taskId: string; title: string };

/**
 * `update-task-settings`: the task's own humanness level, a whole number from 0 to 100, or `null` to remove it so its runs
 * take the Flow's level or the person's starting value again. A task Core does not hold is refused. Touches only the task's
 * memory entry, never a Flow, a saved part or a result.
 */
export type UpdateTaskSettingsRequest = { projectId: string; taskId: string; humanness: number | null };

/** The task's level as it now stands: `null` where it has none of its own. */
export type UpdateTaskSettingsResponse = { taskId: string; humanness: number | null };

/** `remove-task`: forgets the task's memory entry (its notes, the steps it remembers and its attempt index) and nothing else. Its Flow, saved parts, results and attempt rows stay. */
export type RemoveTaskRequest = { projectId: string; taskId: string };

export type RemoveTaskResponse = { taskId: string; removed: true };

/**
 * `get-task-known-flow`: the Flow an identical task already lives under, for the chat to reuse. Asked by `flowId` instead of
 * words (t885), whether a task lives under that Flow and where it starts, for the chat's Run of it. No `flowId` where there is
 * none, or it is gone.
 */
export type GetTaskKnownFlowRequest = { projectId: string; instructionText: string; startLocation?: string } | { projectId: string; flowId: string };

/** `startLocation` only when asked by `flowId`, and only where the task kept one. */
export type GetTaskKnownFlowResponse = { flowId?: string; startLocation?: string };

/** `carry-on-task-attempt`: a press of "add budget and carry on". `addUsd` may be zero for an attempt a restart cut off. A refusal comes back as a sentence a person reads. */
export type CarryOnTaskAttemptRequest = { projectId: string; attemptId: string; addUsd: number };

/** Answered at once; the attempt goes on after the answer. */
export type CarryOnTaskAttemptResponse = { attemptId: string; budgetUsd: number };

/** `run-task-again`: a person's press of Run again on a task's answer. It starts a new attempt with an empty act record: what that press means. A refusal comes back as a sentence a person reads. */
export type RunTaskAgainRequest = { projectId: string; taskId: string };

/** Answered at once; the new attempt goes on after the answer. */
export type RunTaskAgainResponse = { attemptId: string };
