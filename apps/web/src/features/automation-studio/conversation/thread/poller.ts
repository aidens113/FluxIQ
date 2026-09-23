// How a turn written by a server-side run reaches the person at all.
//
// Nothing pushes to this browser. There is no `EventSource` and no client
// `WebSocket` anywhere in the panel; the gateway socket serves the extension.
// The project change feed is not on a timer either -- it fires on start, on
// `hasMore`, and on a mutation this same tab dispatched, and pauses while the
// tab is hidden. So a turn Core wrote during a run would never arrive.
//
// The one mechanism in the product that has ever reached an unattended person
// is the global pairing prompt's adaptive backoff, and this is that mechanism
// made reusable and testable: a fast beat while something is pending, decaying
// towards a ceiling while nothing is, a slow beat while the tab is hidden, and
// an immediate read when it becomes visible again. `setInterval` is not used --
// a fixed interval would stack reads on a slow answer, and a source-text test
// fails a controller that contains one.
//
// The existing `createActivePoller` is not reused because its delay is fixed at
// construction. A conversation needs the delay to move with what the last read
// found, which is the whole point of the backoff.

export const CONVERSATION_POLL_FAST_MS = 1_000;
export const CONVERSATION_POLL_CEILING_MS = 10_000;
export const CONVERSATION_POLL_HIDDEN_MS = 5_000;

export type ConversationPollOutcome = "pending" | "idle" | "failed";

export type BackoffPoller = {
  /** Read now and restart the backoff from its fast beat. */
  sync(): void;
  dispose(): void;
};

/**
 * The next delay, given the last one and what the read found. Pure so the
 * decay can be asserted without a clock: pending pins it to the fast beat,
 * idle decays by 1.6, a failure decays faster at 1.8, and both stop at the
 * ceiling.
 */
export function nextConversationPollDelayMs(currentMs: number, outcome: ConversationPollOutcome): number {
  if (outcome === "pending") return CONVERSATION_POLL_FAST_MS;
  const factor = outcome === "failed" ? 1.8 : 1.6;
  return Math.min(CONVERSATION_POLL_CEILING_MS, Math.round(Math.max(currentMs, CONVERSATION_POLL_FAST_MS) * factor));
}

export function createBackoffPoller<TTimer>(options: {
  /** Whether to poll at all: an unmounted or project-less thread does not. */
  active(): boolean;
  /** Whether the tab is hidden, which slows the beat rather than stopping it. */
  hidden(): boolean;
  /** One read. Its outcome sets the next delay. */
  run(): Promise<ConversationPollOutcome>;
  schedule(callback: () => void, delayMs: number): TTimer;
  cancel(timer: TTimer): void;
}): BackoffPoller {
  let disposed = false;
  let running = false;
  let delayMs = CONVERSATION_POLL_FAST_MS;
  let timer: TTimer | undefined;

  const clear = () => {
    if (timer !== undefined) options.cancel(timer);
    timer = undefined;
  };
  const queue = (nextMs: number) => {
    clear();
    if (disposed || !options.active()) return;
    timer = options.schedule(() => void poll(), nextMs);
  };
  const poll = async (): Promise<void> => {
    if (disposed || running) return;
    if (!options.active()) {
      clear();
      return;
    }
    if (options.hidden()) {
      queue(CONVERSATION_POLL_HIDDEN_MS);
      return;
    }
    running = true;
    let outcome: ConversationPollOutcome = "failed";
    try {
      outcome = await options.run();
    } finally {
      running = false;
      delayMs = nextConversationPollDelayMs(delayMs, outcome);
      queue(delayMs);
    }
  };

  return {
    sync() {
      if (disposed) return;
      delayMs = CONVERSATION_POLL_FAST_MS;
      clear();
      if (options.active()) void poll();
    },
    dispose() {
      disposed = true;
      clear();
    }
  };
}
