// "This time 18s and $0.00. First time 3m 14s and $1.12." Said only of two attempts that
// finished, each with a known time; cost joins only where the port reports it. The numbers
// are told as they are, whichever is larger: never a claim of how much better. An earlier
// attempt that did not finish is told as that, in the same plain terms.

import type { ChatTaskAttempt, ChatTaskAttemptFields } from "../../ports/index.ts";
import { costWords, timeWords } from "./spend-words.ts";

function told(attempt: ChatTaskAttemptFields, reportsSpend: boolean): string | undefined {
  const time = timeWords(attempt);
  if (time === undefined) return undefined;
  const cost = costWords(attempt, reportsSpend);
  return cost === undefined ? time : `${time} and ${cost}`;
}

/** What the earlier attempt's ending was, where it did not finish. */
function stoppedWords(status: ChatTaskAttempt["status"]): string | undefined {
  if (status === "budget_out") return "it ran out of budget after";
  if (status === "stopped_by_person") return "it was stopped after";
  return undefined;
}

/** The comparison line, or none unless this attempt finished and both times are known. */
export function comparedWords(
  now: ChatTaskAttemptFields & { status: string },
  earlier: ChatTaskAttempt | undefined,
  reportsSpend: boolean
): string | undefined {
  if (earlier === undefined) return undefined;
  if (now.status !== "achieved" && now.status !== "finished_unchecked") return undefined;
  const thisTime = told(now, reportsSpend);
  const before = told(earlier, reportsSpend);
  if (thisTime === undefined || before === undefined) return undefined;
  const which = earlier.ordinal === 1 ? "First" : "Last";
  if (earlier.status === "achieved") return `This time ${thisTime}. ${which} time ${before}.`;
  const ended = stoppedWords(earlier.status);
  return ended === undefined ? undefined : `This time ${thisTime}. ${which} time ${ended} ${before}.`;
}
