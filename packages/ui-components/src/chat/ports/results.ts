// A task's answer, for a client that can carry it: one attempt, what it found, and
// what it left saved. Absent: the chat shows no answer turn, and tells a run as it
// always has.
//
// **The records are `@fluxiq/contracts/automation`'s, restated.** This package does
// not depend on `@fluxiq/contracts`: tsc would pass through the workspace paths, and
// its build, which has none, would fail. So they are restated here, and
// `tests/results.test.ts` fails `pnpm check` if one parts from the contract. Keep
// the words where the contract says them (`packages/contracts/src/task-attempts/`).
//
// **Unlike the rest of the transport, these come back checked.** A client's adapter
// runs Core's answer through the contract's parser before it answers, because the
// chat has no reader of its own for these. A record that fails is a failed read
// (`ChatResult`, `ok: false`), never a guess. Requests never throw through a port.

import type { ChatResult } from "./result.ts";

/** A JSON value, as a row holds it. */
export type ChatJsonValue = string | number | boolean | null | ChatJsonObject | ChatJsonValue[];

export type ChatJsonObject = { [key: string]: ChatJsonValue };

/** `AutomationStudioAttemptAct`: one lasting act, in a person's words. */
export type ChatAttemptAct = {
  id: string;
  what: string;
  where: string;
  classes: Array<"move_money" | "delete" | "send_or_publish" | "modify_existing" | "create_new">;
  state: "landed" | "may_have_landed" | "undone" | "not_done";
  rowIdentity?: string;
  undo?: { how: string };
};

/** One pattern of loop caught, at each step of the ladder. */
export type ChatAttemptLoopCount = { steered: number; refused: number; changeApproach: number; askPerson: number };

/** `AutomationStudioTaskAttemptFields`: what every attempt holds, whatever its status. */
export type ChatTaskAttemptFields = {
  taskId: string;
  attemptId: string;
  ordinal: number;
  projectId: string;
  flowId?: string;
  runId?: string;
  path: "explore" | "run_flow" | "run_flow_then_repair" | "run_flow_then_explore";
  spend: { calls: number; inputTokens: number; outputTokens: number; usd: number; ms: number };
  budget: { usd: number };
  liveSteps: number;
  simulation?: { verdict: "passed" | "failed" | "inconclusive" | "not_run"; flags: number };
  loopsCaught: Record<"exact_repeat" | "near_repeat" | "cycle" | "no_progress" | "same_fix" | "same_act", ChatAttemptLoopCount>;
  startedAtMs: number;
  endedAtMs?: number;
};

/**
 * `AutomationStudioTaskAttempt`: one try at a task. `status` has no `failed`, on
 * purpose: a task ends only with its result, its budget gone, or a person stopping
 * it. So the chat has no failed ending to draw, only `budget_out`. A wait always says
 * what it waits for: `permission`, `person_only_check`, `stuck_in_a_loop` when
 * fresh approaches looped too and it stopped spending to ask, or `interrupted` when
 * its Core restarted while it was working.
 */
export type ChatTaskAttempt = ChatTaskAttemptFields & (
  | { status: "working" | "achieved" | "budget_out" | "stopped_by_person" }
  | { status: "waiting_for_person"; waitingFor: "permission" | "person_only_check" | "stuck_in_a_loop" | "interrupted" }
);

/** `AutomationStudioTaskResultRows`: rows real reads stored, by the run and dataset that hold them. */
export type ChatTaskResultRows = {
  runId: string;
  datasetId: string;
  totalRows: number;
  truncated: boolean;
  columns: Array<{ id: string; label: string }>;
  previewRows: ChatJsonObject[];
};

/**
 * `AutomationStudioTaskResult`: what an attempt found, whichever way it ended.
 * `label` is said honestly in three states: `confirmed` a tick, `unverified` no tick
 * and a request to look, `refuted` a failed check. `answerText` is the model's words,
 * and is told as theirs.
 */
export type ChatTaskResult = {
  attemptId: string;
  kind: "rows" | "done_on_site" | "plain_answer" | "partial";
  label: "confirmed" | "refuted" | "unverified";
  timesChecked: number;
  source: "flow" | "exploration" | "both";
  rows?: ChatTaskResultRows;
  acts: ChatAttemptAct[];
  answerText?: { text: string; author: "model" };
  checkedWhat?: string;
  missingWhat?: string;
  skippedAsDone?: number;
  from?: Array<{ site: string; pages: string }>;
};

/** `AutomationStudioSavedState`: the chip. `ready` is never unproven, so the chip can only claim what is true. */
export type ChatSavedState =
  | { state: "ready"; trust: "provisional" | "established"; flowId: string; savedAtMs: number; lastWorkedAtMs: number }
  | { state: "partly_works"; trust: "unproven" | "provisional"; flowId: string; savedAtMs: number; simulation?: "passed" | "failed" | "inconclusive" | "not_run" }
  | { state: "notes_only"; trust: "unproven"; savedAtMs: number }
  | { state: "needs_you"; trust: "unproven" | "provisional" | "established"; flowId?: string; savedAtMs: number };

/**
 * A run that finished with rows and was never judged: not a contract status, and never
 * `achieved` (the contract refuses an `achieved` attempt whose result is not confirmed). A
 * client with no attempt records of its own, reading a run's dataset, tells its runs this
 * way; the answer turn shows them as found and not confirmed, with no tick. Core's attempts
 * never carry it.
 */
export type ChatFinishedRunAttempt = ChatTaskAttemptFields & { status: "finished_unchecked" };

/**
 * Where an attempt's steps came from: the task's memory of it (`taskMemory.provenance`).
 * `from` is `saved` for a step the attempt started with and `worked_out` for one new or
 * changed in it; `ran` says it was reached. Absent on an outcome: nothing is marked.
 */
export type ChatAttemptProvenance = {
  route: string;
  startedFrom: string;
  steps: { position: number; label: string; from: "saved" | "worked_out"; ran: boolean }[];
};

/** An attempt and what goes with it. */
export type ChatTaskOutcome = {
  attempt: ChatTaskAttempt | ChatFinishedRunAttempt;
  /** Absent until there is one. A budget-out attempt with something to show has one. */
  result?: ChatTaskResult;
  saved?: ChatSavedState;
  /** The earlier attempt this one is told against ("This time 18s and $0.00. First time 3m 14s and $1.12."). Absent on a first attempt. */
  comparedTo?: ChatTaskAttempt;
  /**
   * This one outcome carries no real spend: a run a client read from a dataset, beside attempts
   * whose spend is real. Its `spend` is zeros and nothing is said of its cost. Not part of the contract's records.
   */
  spendUnknown?: true;
  /** Where its steps came from, when the attempt's record says. */
  provenance?: ChatAttemptProvenance;
};

/** Which outcomes a thread holds. */
export type ChatResultsThreadQuery = { projectId: string; conversationId: string };

/** One attempt, by its id. */
export type ChatResultsAttemptQuery = { projectId: string; attemptId: string };

/** The rows of one run's dataset, as a file. The formats of `AUTOMATION_STUDIO_RUN_DATASET_EXPORT_FORMATS`. */
export type ChatRowsExportQuery = { projectId: string; runId: string; datasetId: string; format: "csv" | "json" };

/** A task to try again, because a person pressed Run again: choosing it is what lets a saved Flow run (plan, D10). */
export type ChatRunAgainQuery = { projectId: string; taskId: string };

/**
 * More budget for an attempt that ran out, in dollars, above zero. For an attempt its Core's restart
 * cut off (`waitingFor: "interrupted"`) it is zero: nothing ran out, and it carries on as it was.
 */
export type ChatAddBudgetQuery = { projectId: string; attemptId: string; addUsd: number };

/** How a host saves a file for a person. A client's adapter supplies it; the chat never touches a file itself. */
export type ChatDownload = (fileName: string, contentType: string, body: string) => void;

/**
 * Reads an attempt's answer, exports its rows, and tries the task again.
 * `ChatResult`'s `unsupported` says a client cannot carry one of these.
 */
export type ChatResultsPort = {
  /**
   * `false`: this port's records carry no real spend (a client reading a run's
   * dataset before Core writes attempt records fills `spend` with zeros). The
   * answer turn then says nothing of cost or model calls, rather than "$0.00".
   * Absent: the spend is real. Not part of the contract's records.
   */
  readonly reportsSpend?: false;
  /** Every outcome in a thread, oldest first. None yet is an empty list, not a failure. */
  readThread(query: ChatResultsThreadQuery): Promise<ChatResult<{ outcomes: readonly ChatTaskOutcome[] }>>;
  /** One attempt's outcome. An attempt it cannot find is a failed read. */
  readAttempt(query: ChatResultsAttemptQuery): Promise<ChatResult<ChatTaskOutcome>>;
  /** Reads every row, encodes them, and hands the file to the host's download. Answers once it has done so. */
  exportRows(query: ChatRowsExportQuery): Promise<ChatResult<{ fileName: string }>>;
  /** Starts a new attempt at the task and answers which. */
  runAgain(query: ChatRunAgainQuery): Promise<ChatResult<{ attemptId: string }>>;
  /**
   * The budget-out action (plan, D8): raises the attempt's budget and carries it on
   * from where it stopped. The same attempt goes on, keeping its result and its acts,
   * so `attemptId` is the one asked about. An attempt that has not run out is a failed
   * request. Absent: the chat offers no such action.
   */
  addBudgetAndCarryOn?(query: ChatAddBudgetQuery): Promise<ChatResult<{ attemptId: string; budgetUsd: number }>>;
};
