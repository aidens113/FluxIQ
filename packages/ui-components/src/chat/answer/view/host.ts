// What a host adds to the answer turn: the callbacks that are its to answer. The answer
// turn never calls the runs port itself; Keep going, Tell it more and Stop are the
// host's, and "What I did" reveals the step messages, which only the host can find.

import type { ChatResultsPort } from "../../ports/index.ts";

/** The results port and the host's callbacks. Each action is offered only where its callback or port method exists. */
export type AnswerHost = {
  results?: ChatResultsPort | undefined;
  /** Scrolls to or reveals the step messages of this attempt. Never folds them. */
  onWhatIDid?: ((attemptId: string) => void) | undefined;
  onKeepGoing?: ((attemptId: string) => void) | undefined;
  onTellMore?: ((attemptId: string) => void) | undefined;
  onStop?: ((attemptId: string) => void) | undefined;
  /** Something changed on the host's side (budget added, run started): re-read the thread's outcomes. */
  onChanged?: (() => void) | undefined;
};
