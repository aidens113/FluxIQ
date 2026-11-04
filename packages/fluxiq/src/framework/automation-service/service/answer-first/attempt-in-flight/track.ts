import { automationStudioTaskAttemptCounterOf } from "./counter-of.ts";

/**
 * Counts one attempt for the whole of `run`, however it ends (an answer, a throw,
 * a stop). An attempt can wait a long time holding nothing: a person's answer, a
 * provider's backoff. It may hold no project database and its gateway session may
 * have gone, so this count, not those, is what says it is still working.
 */
export async function trackAutomationStudioTaskAttempt<T>(owner: object, run: () => Promise<T>): Promise<T> {
  const counter = automationStudioTaskAttemptCounterOf(owner);
  counter.inFlight += 1;
  try {
    return await run();
  } finally {
    counter.inFlight -= 1;
  }
}
