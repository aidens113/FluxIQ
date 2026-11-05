import { automationStudioTaskAttemptCounterOf } from "./counter-of.ts";

/**
 * How many task attempts this service has entered and not left. Read without
 * making anything but the counter: it opens no storage and starts nothing, so a
 * workspace manager may ask at any time (`programs/_shared/runtime.ts`).
 */
export function automationStudioTaskAttemptsInFlight(owner: object): number {
  return automationStudioTaskAttemptCounterOf(owner).inFlight;
}
