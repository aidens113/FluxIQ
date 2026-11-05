// A model key that locks during an attempt: the wait is in the provider, before a call's own
// clock starts, and it ends by itself when the person unlocks. So the attempt only says what it
// is waiting for while that lasts, as it does for its other waits, and leaves the time out of what
// its limits count. It listens to this attempt's own provider, so no other attempt's wait,
// nor anyone else's on the same Flow, can stop one of its limits firing.

import type { AutomationStudioLlmProvider } from "../../../../../runtime/llm/index.ts";

type Waiting = { waitingFor?: string | undefined; waitedMs: number };

/** Listens until `stop`. `heldMs` is this attempt's time waiting for a person so far, the wait in progress included. */
export function automationStudioAnswerFirstWatchKeyWaits(input: { run: Waiting; provider: AutomationStudioLlmProvider; keep: () => void; now?: () => number }): { heldMs(): number; stop(): void } {
  const { run, keep } = input;
  const now = input.now ?? Date.now;
  let open = 0;
  let since = 0;
  const stop = input.provider.observeHolds?.((state) => {
    if (state === "started") {
      open += 1;
      if (open > 1) return;
      since = now();
      if (run.waitingFor !== undefined) return;
      run.waitingFor = "model_key_locked";
      keep();
      return;
    }
    open -= 1;
    if (open > 0) return;
    run.waitedMs += Math.max(0, now() - since);
    if (run.waitingFor !== "model_key_locked") return;
    run.waitingFor = undefined;
    keep();
  });
  return {
    heldMs: () => run.waitedMs + (open > 0 ? Math.max(0, now() - since) : 0),
    stop: () => stop?.()
  };
}
