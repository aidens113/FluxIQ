// What the answer turn's view remembers between draws, and what its buttons do. Kept
// apart from the model so that a re-read which changes nothing changes nothing on screen,
// and "Show all" stays open across it.

/** The buttons that call the results port and so can be busy. */
export type AnswerBusy = "csv" | "json" | "run_again" | "budget";

/** What the last press said: what it did, or why it could not. */
export type AnswerStatus = { text: string; tone: "ok" | "error" };

/** The turn's own state. */
export type AnswerState = { expanded: boolean; busy: AnswerBusy | undefined; status: AnswerStatus | undefined };

/** What the buttons do. Only those the host and port can carry are drawn. */
export type AnswerHandlers = {
  toggleRows(): void;
  exportRows(format: "csv" | "json"): void;
  runAgain(): void;
  addBudget(): void;
  whatIDid(): void;
  keepGoing(): void;
  tellMore(): void;
  stop(): void;
};
