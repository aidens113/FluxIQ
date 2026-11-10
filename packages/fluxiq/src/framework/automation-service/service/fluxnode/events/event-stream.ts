// A run's events as the program reads them (GET runs/{runId}/events): every event after `afterSeq`,
// the ones already told first, then each as it is told, ending after `ended`. The reader going away
// (`signal`) ends the reading and never the run.

import type { FluxNodeRunEvent } from "@fluxiq/contracts/fluxnode";
import type { FluxNodeRun } from "../fluxnode-run.ts";

export async function* fluxNodeEventStream(run: FluxNodeRun, afterSeq: number, signal: AbortSignal): AsyncGenerator<FluxNodeRunEvent> {
  let seen = Math.max(0, Math.floor(afterSeq));
  while (!signal.aborted) {
    const fresh = run.eventsAfter(seen);
    for (const event of fresh) {
      seen = event.seq;
      yield event;
      if (event.type === "ended") return;
    }
    if (run.result && run.eventsAfter(seen).length === 0) return;
    await nextEventOrAbort(run, seen, signal);
  }
}

/** Resolves once an event after `seen` is told, or the reader went away. */
async function nextEventOrAbort(run: FluxNodeRun, seen: number, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => {
    const done = (): void => {
      stopListening();
      signal.removeEventListener("abort", done);
      resolve();
    };
    const stopListening = run.listen(done);
    signal.addEventListener("abort", done, { once: true });
    if (run.eventsAfter(seen).length > 0 || signal.aborted) done();
  });
}
