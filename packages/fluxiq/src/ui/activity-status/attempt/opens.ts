import { ACTIVITY_ATTEMPT_WORDS } from "./words.ts";

/** Whether `label` opens an attempt's activity. */
export function opensActivityAttempt(label: string): boolean {
  return label === ACTIVITY_ATTEMPT_WORDS.working;
}
