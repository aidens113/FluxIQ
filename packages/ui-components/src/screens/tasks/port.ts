// What the tasks screen reads and does, through the client's port. A task is the thing a
// person asked for; each try at it is an attempt (`ChatTaskOutcome`, the answer turn's record).
// Every optional method that is absent means its control is not drawn. Add budget, Run again
// and the rows export are `ChatResultsPort`'s, passed to the screen beside this port.
//
// There is no failed status anywhere in these records: `budget_out` is the one failure shape,
// and an attempt a restart cut off is `waiting_for_person` with `waitingFor: "interrupted"`.

import type { ChatResult, ChatTaskOutcome } from "../../chat/ports/index.ts";

/** One task in the list. `title` is the person's own words, or the name they gave it. */
export type TaskSummary = {
  taskId: string;
  projectId: string;
  title: string;
  conversationId?: string;
  flowId?: string;
  /** The newest attempt and what it holds. */
  latest: ChatTaskOutcome;
  attemptCount: number;
  updatedAtMs: number;
};

/** One step of an attempt, as it was told in the chat. `quiet` steps are small reads the person need not follow. */
export type TaskStep = {
  stepId: string;
  atMs: number;
  title: string;
  reason?: string;
  result?: string;
  quiet?: boolean;
};

/** Where an attempt's steps came from: the task's memory of it (`taskMemory.provenance`). */
export type TaskProvenance = {
  route: string;
  startedFrom: string;
  steps: { position: number; label: string; from: "saved" | "worked_out"; ran: boolean }[];
};

export type TasksListQuery = { projectId: string; text?: string; limit: number; cursor?: string };

/** Reads and changes a person's tasks. Requests never throw: a failure is a failed `ChatResult`. */
export type TasksPort = {
  list(query: TasksListQuery): Promise<ChatResult<{ tasks: readonly TaskSummary[]; nextCursor: string | null }>>;
  /** `attempts` newest first. */
  read(query: { projectId: string; taskId: string }): Promise<ChatResult<{ task: TaskSummary; attempts: readonly ChatTaskOutcome[] }>>;
  /** The attempt's durable steps. Absent: the steps are not shown. */
  readSteps?(query: { projectId: string; attemptId: string }): Promise<ChatResult<{ steps: readonly TaskStep[] }>>;
  /** Absent: nothing is marked as saved or worked out again. */
  readProvenance?(query: { projectId: string; attemptId: string }): Promise<ChatResult<TaskProvenance>>;
  /** Carries on an interrupted attempt. Absent: no Carry on. */
  carryOn?(query: { projectId: string; attemptId: string }): Promise<ChatResult<{ attemptId: string }>>;
  rename?(query: { projectId: string; taskId: string; title: string }): Promise<ChatResult<unknown>>;
  remove?(query: { projectId: string; taskId: string }): Promise<ChatResult<unknown>>;
};

/** Which task is open, kept by the client so a panel that closed reopens on it. Storage stays the client's. */
export type TasksMemory = {
  read(): Promise<{ projectId: string; taskId: string } | undefined>;
  write(open: { projectId: string; taskId: string } | undefined): Promise<void>;
};
