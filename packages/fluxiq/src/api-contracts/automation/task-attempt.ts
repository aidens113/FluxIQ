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
};

/** `get-task-attempt`. An attempt Core cannot find is refused, and so is a file it cannot read, in different words. */
export type GetTaskAttemptRequest = { projectId: string; attemptId: string };

export type GetTaskAttemptResponse = { outcome: AutomationStudioTaskOutcome };

/** `list-conversation-task-attempts`. None yet is an empty list, and a file Core cannot read is refused, never an empty list. */
export type ListConversationTaskAttemptsRequest = { projectId: string; conversationId: string };

export type ListConversationTaskAttemptsResponse = { outcomes: AutomationStudioTaskOutcome[] };

/** `get-task-known-flow`: the Flow an identical task already lives under, for the chat to reuse. No `flowId` where there is none, or it is gone. */
export type GetTaskKnownFlowRequest = { projectId: string; instructionText: string; startLocation?: string };

export type GetTaskKnownFlowResponse = { flowId?: string };

/** `carry-on-task-attempt`: a press of "add budget and carry on". `addUsd` may be zero for an attempt a restart cut off. A refusal comes back as a sentence a person reads. */
export type CarryOnTaskAttemptRequest = { projectId: string; attemptId: string; addUsd: number };

/** Answered at once; the attempt goes on after the answer. */
export type CarryOnTaskAttemptResponse = { attemptId: string; budgetUsd: number };
