// The recorded traces an offline trial runs on (traces and offline trials, P4,
// source test T24), held in an async-context scope for the whole of that
// trial, so the trial's own episode -- opened deep inside the trial runner
// (`./wiring/trial.ts`) -- can name them as its derived trace's sources. The
// offline trial runner enters it (`../service/offline-trial/run.ts`); nothing
// else does, and outside it there are none.

import { AsyncLocalStorage } from "node:async_hooks";

const sources = new AsyncLocalStorage<readonly string[]>();

export const AutomationStudioGatewayTraceReplaySources = Object.freeze({
  /** Runs `work` with `traceIds` as the recorded traces it replays. */
  run<T>(traceIds: readonly string[], work: () => Promise<T>): Promise<T> {
    return sources.run(Object.freeze([...traceIds]), work);
  },
  /** The recorded traces the calling async context replays, or nothing outside every offline trial. */
  current(): readonly string[] | undefined {
    return sources.getStore();
  }
});
