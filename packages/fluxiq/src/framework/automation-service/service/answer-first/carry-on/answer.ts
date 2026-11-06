/** What a press is told at once. `refused` is for the caller's code; `say` is what a person reads. */
export type AutomationStudioAnswerFirstCarryOnAnswer<T> =
  | { ok: false; refused: AutomationStudioAnswerFirstCarryOnRefusedCode; say: string }
  | {
    ok: true;
    attemptId: string;
    /** The attempt's budget from now on: what it had, and what was added. */
    budgetUsd: number;
    /** What `run` answers, once the attempt has gone on to wherever it ends. */
    finished: Promise<T>;
  };

export type AutomationStudioAnswerFirstCarryOnRefusedCode =
  | "unknown_attempt"
  | "live"
  | "achieved"
  | "waiting_for_person"
  | "no_budget_added"
  | "later_attempt"
  | "acts_unreadable"
  | "unreadable";
