// The answer turn as data: everything its view draws, already in words, so the view
// holds no wording of its own and a test reads the words without a DOM.

/** What the answer is: the four a task can find, and the ways it can be unfinished. */
export type AnswerKind = "rows" | "done_on_site" | "plain_answer" | "partial" | "budget_out" | "waiting" | "stopped";

/** The check, said honestly: a tick only when confirmed, a failed mark when refuted, no mark otherwise. */
export type AnswerCheck = { state: "confirmed" | "unverified" | "refuted"; mark: "tick" | "cross" | "none"; words: string };

/** The rows of an answer, as text cells. `rows` is every previewed row; the view shows the first `collapsedCount` until opened. */
export type AnswerRows = {
  columns: string[];
  rows: string[][];
  collapsedCount: number;
  total: number;
  /** Said under the table when it holds fewer rows than were found: once as it first shows, once opened. */
  partialNotes?: { collapsed: string; expanded: string };
  /** The "Show all N" button, when there are previewed rows beyond the first few. */
  expandWords?: string;
  runId: string;
  datasetId: string;
};

/** The one button of a budget-out answer. `words` carries the amount when the port reports real spend. */
export type AnswerAddBudget = { addUsd: number; words: string };

/** An answer turn, ready to draw. */
export type AnswerModel = {
  attemptId: string;
  taskId: string;
  projectId: string;
  kind: AnswerKind;
  headline: string;
  /** One plain sentence under the headline: what it waits for, or what follows. */
  lead?: string;
  /** "What I got" over a result that did not finish. */
  gotLine?: string;
  check?: AnswerCheck;
  rows?: AnswerRows;
  text?: { label: string; text: string };
  /** "On the site: ..." as one line, or one line per lasting act. */
  siteTitle?: string;
  siteLines: string[];
  checked?: string;
  missing?: string;
  from?: string;
  compared?: string;
  saved?: string;
  canRunAgain: boolean;
  /** Said above Run again when running the task again could repeat something done on the site. */
  runAgainNote?: string;
  canExport: boolean;
  addBudget?: AnswerAddBudget;
  /** Keep going, Tell it more, Stop: offered when it is stuck in a loop. */
  stuckActions: boolean;
};
