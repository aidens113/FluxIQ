// Reading a task's attempts back (t869). The records are `@fluxiq/contracts/automation`'s, and Core
// answers them through the contract's parsers. A client runs them through the same parsers again,
// so a record that fails is a failed read and never a guess.

import type { AutomationStudioSavedState, AutomationStudioTaskAttempt, AutomationStudioTaskResult } from "@fluxiq/contracts/automation";

/** One attempt at a task and what goes with it. */
export type AutomationStudioTaskOutcome = {
  attempt: AutomationStudioTaskAttempt;
  /** The best so far while it works, and what it found once it has ended. */
  result?: AutomationStudioTaskResult;
  /** What it left saved. Absent where nothing was. */
  saved?: AutomationStudioSavedState;
  /** The latest earlier attempt at the same task on this Flow that ended. Absent on a first attempt. */
  comparedTo?: AutomationStudioTaskAttempt;
};

/** `get-task-attempt`. An attempt Core cannot find is refused, and so is a file it cannot read, in different words. */
export type GetTaskAttemptRequest = { projectId: string; attemptId: string };

export type GetTaskAttemptResponse = { outcome: AutomationStudioTaskOutcome };

/** `list-conversation-task-attempts`. None yet is an empty list, and a file Core cannot read is refused, never an empty list. */
export type ListConversationTaskAttemptsRequest = { projectId: string; conversationId: string };

export type ListConversationTaskAttemptsResponse = { outcomes: AutomationStudioTaskOutcome[] };
