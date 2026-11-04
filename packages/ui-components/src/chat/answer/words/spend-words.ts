// How long an attempt took and what it cost, as numbers a person can compare. Time is
// said whenever it is known; cost only when the port's spend is real.

import type { ChatTaskAttemptFields } from "../../ports/index.ts";
import { durationWords } from "./duration-words.ts";
import { usdWords } from "./usd-words.ts";

/** The attempt's time in words, when known: its own clock, else the span between its start and end. */
export function timeWords(attempt: ChatTaskAttemptFields): string | undefined {
  const span = attempt.endedAtMs === undefined ? 0 : attempt.endedAtMs - attempt.startedAtMs;
  const ms = attempt.spend.ms > 0 ? attempt.spend.ms : span;
  return ms > 0 ? durationWords(ms) : undefined;
}

/** The attempt's cost in words; none where the port does not report spend. */
export function costWords(attempt: ChatTaskAttemptFields, reportsSpend: boolean): string | undefined {
  return reportsSpend ? usdWords(attempt.spend.usd) : undefined;
}
