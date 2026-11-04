// "This time 18s and $0.00. First time 3m 14s and $1.12." Both times must be known, and
// cost joins only where the port reports it. Never a claim of how much better.

import type { ChatTaskAttemptFields } from "../../ports/index.ts";
import { costWords, timeWords } from "./spend-words.ts";

function told(attempt: ChatTaskAttemptFields, reportsSpend: boolean): string | undefined {
  const time = timeWords(attempt);
  if (time === undefined) return undefined;
  const cost = costWords(attempt, reportsSpend);
  return cost === undefined ? time : `${time} and ${cost}`;
}

/** The comparison line, or none when either attempt's time is unknown. */
export function comparedWords(now: ChatTaskAttemptFields, earlier: ChatTaskAttemptFields | undefined, reportsSpend: boolean): string | undefined {
  if (earlier === undefined) return undefined;
  const thisTime = told(now, reportsSpend);
  const before = told(earlier, reportsSpend);
  if (thisTime === undefined || before === undefined) return undefined;
  return `This time ${thisTime}. ${earlier.ordinal === 1 ? "First" : "Last"} time ${before}.`;
}
