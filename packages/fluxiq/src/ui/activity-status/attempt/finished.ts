import { ACTIVITY_ATTEMPT_WORDS } from "./words.ts";

/**
 * Whether an attempt's settling row says the task reached its result. Only that earns a tick:
 * a budget gone, a Stop, a wait and a setup step all settle as `done`, because none of them is an
 * error, and none of them is a confirmed result either, so a host must draw them with no tick.
 */
export function activityAttemptFinished(label: string): boolean {
  return label === ACTIVITY_ATTEMPT_WORDS.finished;
}
