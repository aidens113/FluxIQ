/** What an attempt learned about a task, in words, for the next attempt at the same task. */
export type AutomationStudioAnswerFirstTaskNote = {
  attemptId: string;
  atMs: number;
  from: "model" | "core";
  worked?: string;
  failed?: string;
  quirks?: string;
};
