// The conversation as a parking port: where a run's question goes, and where
// its answer comes back from.
//
// The executor raises asks and knows nothing about threads; the thread owns the
// question and knows nothing about runs. This is the one place that joins them,
// and it is deliberately thin, because there is nothing to translate: an ask is
// already what the store accepts, so opening one is posting the turn it hangs
// on.
//
// It talks to a host rather than to `AutomationStudioConversations` itself, so
// nothing here imports a store, a pool or a database. The collaborator
// satisfies the host by having the three methods; a test satisfies it with
// three functions.

import type { AutomationStudioConversationAsk, AutomationStudioConversationAskInput, AutomationStudioConversationSubject, AutomationStudioConversationWriter } from "../conversations/index.ts";
import type { AutomationStudioAsk } from "./ask.ts";
import type { AutomationStudioAskAnswer } from "./answer.ts";
import type { AutomationStudioParkingPort } from "./port.ts";

/** How often the thread is re-read while waiting, when nothing in this process says the ask has moved. */
const DEFAULT_POLL_INTERVAL_MS = 2_000;

/** What carrying a question to a person takes: a thread to write in, and the ask read back as it now stands. */
export type AutomationStudioConversationParkingHost = {
  writerFor(input: { projectId: string; subject: AutomationStudioConversationSubject }): AutomationStudioConversationWriter;
  getAsk(input: { projectId: string; askId: string }): Promise<AutomationStudioConversationAsk | null>;
  /** Closes an ask nobody answered, or hands back the answer that beat the deadline. */
  expireAsk(input: { projectId: string; askId: string }): Promise<AutomationStudioConversationAsk>;
  /** Tells this process the moment an ask is settled here, so waiting is not polling alone. Returns the way to stop listening. */
  onAskSettled?(askId: string, listener: () => void): () => void;
};

export type AutomationStudioConversationParkingPortInput = {
  host: AutomationStudioConversationParkingHost;
  projectId: string;
  /** What the thread is about: the run, the build or the Flow whose question this is. */
  subject: AutomationStudioConversationSubject;
  pollIntervalMs?: number;
  now?: () => number;
};

/**
 * A port bound to one subject's thread.
 *
 * It implements `awaitAnswer`, which holds the run in place rather than parking
 * it durably, and that is a decision worth stating. A durable park survives a
 * restart, but a run's inputs are deliberately never persisted, so a resume
 * from the saved trace comes back with `[withheld]` wherever a binding had
 * resolved a value out of state -- it resumes a run that has forgotten part of
 * what it was doing. Waiting in place keeps every value, every variable and
 * every loop position exactly as the run left them, because the run never
 * returned. What it costs is a process: a restart loses the run, though never
 * the question, which is a row in the project's database and is still there to
 * be answered. The run's own abort signal is the escape hatch, so cancelling a
 * run still frees it.
 */
export function automationStudioConversationParkingPort(input: AutomationStudioConversationParkingPortInput): AutomationStudioParkingPort {
  const host = input.host;
  const now = input.now ?? (() => Date.now());
  const pollIntervalMs = Math.max(1, input.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
  let writer: AutomationStudioConversationWriter | undefined;
  const thread = (): AutomationStudioConversationWriter => (writer ??= host.writerFor({ projectId: input.projectId, subject: input.subject }));
  return {
    open: async (ask) => {
      await thread().ask({ text: ask.text, ask: automationStudioConversationAskInput(ask) });
    },
    awaitAnswer: async (ask, wait) => {
      for (;;) {
        // Listening starts before the thread is read, never after it. An answer
        // written in the gap between the two would otherwise wake nothing, and
        // the run would sit out a whole poll interval waiting for news that had
        // already arrived.
        const settling = listenForSettlement(host, ask.askId);
        try {
          // A thread that cannot be read fails the run, with the store's own
          // error, and a thread that no longer holds the ask fails it with the
          // sentence below. Neither is swallowed, because the one outcome this
          // mechanism must never produce is a run waiting forever on a question
          // nobody will ever answer.
          const settled = await host.getAsk({ projectId: input.projectId, askId: ask.askId });
          if (settled === null) throw new Error(`Ask ${ask.askId} is no longer in its thread, so this run has nothing left to wait for.`);
          const answer = settledAnswer(settled);
          if (answer !== undefined) return answer;
          if (settled.status === "expired") return undefined;
          // A cancelled run is not a question that timed out, but it is a run
          // that must stop waiting. It leaves the node by the timed-out route
          // and the executor's own cancellation check ends it before the next
          // node.
          if (wait.signal?.aborted) return undefined;
          if (wait.expiresAtMs !== undefined && now() >= wait.expiresAtMs) {
            // The store decides the race: an answer that landed first comes
            // back instead of the timeout that was about to be declared, which
            // is the only way an ask cannot end up both answered and timed out.
            return settledAnswer(await host.expireAsk({ projectId: input.projectId, askId: ask.askId }));
          }
          await nextLook({
            settled: settling.settled,
            pollIntervalMs,
            now,
            ...(wait.expiresAtMs === undefined ? {} : { expiresAtMs: wait.expiresAtMs }),
            ...(wait.signal ? { signal: wait.signal } : {})
          });
        } finally {
          settling.stop();
        }
      }
    }
  };
}

/**
 * The ask as the store accepts it: the runtime ask without the three things
 * only a live run knows. Written as a rest destructure rather than a field
 * list, so a field added to the ask reaches the thread without being wired
 * through here a second time.
 */
export function automationStudioConversationAskInput(ask: AutomationStudioAsk): AutomationStudioConversationAskInput {
  const { status: _status, text: _text, raisedBy: _raisedBy, ...input } = ask;
  return input;
}

function settledAnswer(ask: AutomationStudioConversationAsk | null): AutomationStudioAskAnswer | undefined {
  return ask?.status === "answered" && ask.answer ? ask.answer : undefined;
}

/** A settlement heard in this process, listened for from before the thread is read until the wait moves on. */
function listenForSettlement(host: AutomationStudioConversationParkingHost, askId: string): { settled: Promise<void>; stop: () => void } {
  let heard: () => void = () => {};
  const settled = new Promise<void>((resolve) => { heard = resolve; });
  const stopListening = host.onAskSettled?.(askId, () => heard());
  return { settled, stop: () => stopListening?.() };
}

/**
 * Waits for whichever comes first: the ask being settled in this process, the
 * poll interval, the deadline, or the run being cancelled. The poll is the
 * backstop for an answer written by another process, which is why it is never
 * the only thing waited on -- an answer through the API in this process wakes
 * the run at once.
 */
function nextLook(input: {
  settled: Promise<void>;
  pollIntervalMs: number;
  now: () => number;
  expiresAtMs?: number;
  signal?: AbortSignal;
}): Promise<void> {
  return new Promise((resolve) => {
    let looked = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const look = (): void => {
      if (looked) return;
      looked = true;
      if (timer !== undefined) clearTimeout(timer);
      input.signal?.removeEventListener("abort", look);
      resolve();
    };
    const untilDeadline = input.expiresAtMs === undefined ? input.pollIntervalMs : input.expiresAtMs - input.now();
    timer = setTimeout(look, Math.max(1, Math.min(input.pollIntervalMs, untilDeadline)));
    void input.settled.then(look);
    input.signal?.addEventListener("abort", look, { once: true });
  });
}
