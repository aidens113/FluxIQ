// The question a stuck attempt puts to the person (plan D14, step 4, as R7 revised it): posted,
// never waited on.
//
// **Why it does not wait (run-mwc6ut8u-52e3c1b3, R7).** It used to park the attempt at
// `waiting_for_person` until someone answered "keep going or stop". Three live runs sat there
// until their proof gave up after 600 s, and the person's rule is that a task ends only with its
// result or its budget gone. So the attempt now steers itself onto a fresh round (`./rounds.ts`)
// and, at the same moment, posts the question built from the loop's own evidence
// (`../loop-signal/stuck-question.ts`) as an open question that does not park. The attempt never
// waits for it. When the person answers, at any point, their words go to `heard`, and every later
// round is told them as guidance.
//
// **One question open at a time.** A later loop while it is still unanswered posts nothing more:
// the person has the question already, and more of the same would only bury it. Once it is
// answered, a later loop may ask again.
//
// **Closed with the attempt.** `close` ends the wait. The conversation port then closes a question
// nobody answered (`../../../../../runtime/automation-parking/conversation-port.ts`), so nothing is
// left under the thread with no attempt behind it. A person's Stop closes it too.

import { randomUUID } from "node:crypto";
import type { AutomationStudioAsk, AutomationStudioParkingPort } from "../../../../../runtime/automation-parking/index.ts";

export type AutomationStudioAnswerFirstStuckAsking = {
  /** Posts `question` unless one is still open or nobody can be asked; answers whether it was posted. Never waits for the answer. */
  post(question: string): Promise<boolean>;
  /** Whether a question is open now, unanswered. */
  open(): boolean;
  /** Ends the wait for an open question, and settles once it has ended. */
  close(): Promise<void>;
};

export function automationStudioAnswerFirstStuckAsking(input: {
  port: AutomationStudioParkingPort | undefined;
  /** The person's Stop. */
  signal: AbortSignal | undefined;
  /** The person's own words, whenever they come. */
  heard(words: string): void;
  /** The question could not be posted, or its answer read: said, never an ending. */
  failed(error: unknown): void;
}): AutomationStudioAnswerFirstStuckAsking {
  const { port } = input;
  const ending = new AbortController();
  const stop = (): void => ending.abort();
  input.signal?.addEventListener("abort", stop, { once: true });
  if (input.signal?.aborted) stop();
  let waiting: Promise<void> | undefined;
  return {
    async post(question) {
      if (waiting !== undefined || !port?.awaitAnswer || ending.signal.aborted) return false;
      const ask: AutomationStudioAsk = {
        askId: `stuck.${randomUUID()}`,
        kind: "open",
        parks: false,
        timeoutMs: null,
        onTimeout: null,
        options: null,
        routes: null,
        consequences: [],
        control: { name: null, kind: "stuck_in_a_loop" },
        status: "pending",
        text: question,
        raisedBy: { stage: "authoring" }
      };
      try {
        await port.open(ask);
      } catch (error) {
        input.failed(error);
        return false;
      }
      waiting = port.awaitAnswer(ask, { signal: ending.signal }).then(
        (answer) => {
          const words = answer?.kind === "text" ? answer.value?.trim() : undefined;
          if (words) input.heard(words);
        },
        (error: unknown) => {
          // A wait ended by the attempt's own close or a Stop is no failure to read an answer.
          if (!ending.signal.aborted) input.failed(error);
        }
      ).finally(() => {
        waiting = undefined;
      });
      return true;
    },
    open: () => waiting !== undefined,
    async close() {
      stop();
      input.signal?.removeEventListener("abort", stop);
      await waiting;
    }
  };
}
