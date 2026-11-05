/** What a press is told at once. `refused` is for the caller's code; `say` is what a person reads. */
export type AutomationStudioAnswerFirstRunAgainAnswer<T> =
  | { ok: false; refused: AutomationStudioAnswerFirstRunAgainRefusedCode; say: string }
  | {
    ok: true;
    attemptId: string;
    flowId: string;
    /** What `run` answers, once the new attempt has ended. */
    finished: Promise<T>;
  };

export type AutomationStudioAnswerFirstRunAgainRefusedCode = "unknown_task" | "live" | "other_task_on_flow" | "unreadable";
