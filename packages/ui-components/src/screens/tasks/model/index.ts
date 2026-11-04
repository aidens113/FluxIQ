// The tasks screen as data: every word it draws, with no DOM, so a test reads the words.
export { taskActions, type TaskActions } from "./actions.ts";
export { attemptEntry, type AttemptEntry, type AttemptEntryOptions } from "./attempt.ts";
export { clockWords } from "./clock-words.ts";
export { dayHeading } from "./day-heading.ts";
export { deleteWords, type DeleteWords } from "./delete-words.ts";
export { groupTasks, NEEDS_YOU_HEADING, type TaskGroup } from "./grouping.ts";
export { whereItGotTo } from "./progress.ts";
export { taskRow, type TaskRow, type TaskRowOptions } from "./row.ts";
export { taskState, type TaskState, type TaskStateKey } from "./state.ts";
export { FROM_SAVED, quietWords, stepRuns, WORKED_OUT, type StepEntry, type StepRun } from "./steps.ts";
export { ownWaitingWords, waitingReason } from "./waiting.ts";
