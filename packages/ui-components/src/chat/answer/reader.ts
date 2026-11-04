// Reads a thread's task outcomes through the results port and keeps them for the stream.
//
// The records come back already checked by the client's adapter, so a failed read is no
// turn, never a guess: nothing is made up from a read that did not succeed. A client that
// cannot carry results (`unsupported`, or no port at all) has no outcomes. A failed read
// after a good one for the same thread keeps what was read, so a blip does not take an
// answer off the screen; it is replaced by the next good read. A different thread starts
// empty. A reply for a thread the reader has moved on from is dropped.

import type { ChatResultsPort, ChatResultsThreadQuery, ChatTaskOutcome } from "../ports/index.ts";

/** The reader. */
export type AnswerReader = {
  /** The outcomes of the thread last read, oldest first. */
  outcomes(): readonly ChatTaskOutcome[];
  /** Reads the thread again. Answers once the outcomes are up to date; `onChange` has heard of any change by then. */
  read(): Promise<void>;
};

const keyOf = (query: ChatResultsThreadQuery | undefined): string => (query === undefined ? "" : `${query.projectId}\u0000${query.conversationId}`);

/**
 * Creates it over `results` (absent: it holds nothing). `query` names the thread now on
 * screen, or none. `onChange` hears that the outcomes changed, so the chat can draw again.
 */
export function createAnswerReader(results: ChatResultsPort | undefined, query: () => ChatResultsThreadQuery | undefined, onChange: () => void = () => undefined): AnswerReader {
  let held: readonly ChatTaskOutcome[] = [];
  let heldKey = "";
  let heldSignature = "[]";

  function set(outcomes: readonly ChatTaskOutcome[], key: string): void {
    const signature = JSON.stringify(outcomes);
    const changed = signature !== heldSignature;
    held = outcomes;
    heldKey = key;
    heldSignature = signature;
    if (changed) onChange();
  }

  return {
    outcomes: () => held,
    async read() {
      const asked = query();
      const key = keyOf(asked);
      if (heldKey !== key) set([], key);
      if (results === undefined || asked === undefined) return;
      let answer: Awaited<ReturnType<ChatResultsPort["readThread"]>>;
      try {
        answer = await results.readThread(asked);
      } catch {
        return;
      }
      if (keyOf(query()) !== key) return;
      if (answer.ok) set(answer.value.outcomes, key);
      else if (answer.unsupported === true) set([], key);
    }
  };
}
