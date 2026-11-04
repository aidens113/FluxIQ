// One wait for a silent model service: the delay for the Nth silence in a row,
// and the one plain sentence the chat says about it.

import { AUTOMATION_STUDIO_ANSWER_FIRST_BACKOFF } from "./backoff-schedule.ts";

/** `backoffs` is how many silences came before this one, in a row; it resets to 0 when the provider answers. */
export function automationStudioAnswerFirstBackoff(backoffs: number): { waitMs: number; say: string } {
  const count = Number.isFinite(backoffs) && backoffs > 0 ? Math.floor(backoffs) : 0;
  const { baseMs, capMs } = AUTOMATION_STUDIO_ANSWER_FIRST_BACKOFF;
  const waitMs = count >= 30 ? capMs : Math.min(capMs, baseMs * 2 ** count);
  const seconds = Math.round(waitMs / 1000);
  return { waitMs, say: `The model service is not answering, so I am waiting ${seconds} seconds and then asking again; Stop works at any time.` };
}
