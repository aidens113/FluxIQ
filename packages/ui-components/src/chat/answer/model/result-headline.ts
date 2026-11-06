// The headline of a result, and a short account of what it holds, in words. A count comes
// from the rows' own total; "of" is said only of a confirmed result.

import type { ChatTaskResult } from "../../ports/index.ts";
import { isEarlierAct } from "../words/index.ts";
import { effectiveLabel } from "./effective-label.ts";

/** "1 row" or "10 rows". */
export function rowsWord(count: number): string {
  return count === 1 ? "1 row" : `${count} rows`;
}

/** Whether `result` holds anything to show: rows, the model's words, or a lasting act. */
export function hasContent(result: ChatTaskResult | undefined): result is ChatTaskResult {
  return result !== undefined && (result.rows !== undefined || result.answerText !== undefined || result.acts.length > 0);
}

/** The headline of a task that reached an ending with its result. */
export function resultHeadline(result: ChatTaskResult): string {
  const count = result.rows?.totalRows;
  switch (result.kind) {
    case "rows":
      if (count === undefined || count === 0) return "Found no rows";
      return effectiveLabel(result) === "confirmed" ? `Found ${count} of ${count}` : `Found ${rowsWord(count)}`;
    case "done_on_site":
      return "Done on the site";
    case "plain_answer":
      return "Here is what I found";
    case "partial":
      return count === undefined ? "Here is what I got, and what is missing" : `Here ${count === 1 ? "is the 1" : `are the ${count}`} I got, and what is missing`;
  }
}

/** "3 things", for what a result did on the site. */
function thingsWord(count: number): string {
  return count === 1 ? "1 thing" : `${count} things`;
}

/** What an unfinished result holds, for "What I got: ...": its rows or words, and what it did on the site, said as the record says it. */
export function gotSummary(result: ChatTaskResult): string {
  // An act an earlier attempt did is not this attempt's: it is said apart, never counted with what this one did.
  const own = result.acts.filter((act) => !isEarlierAct(act));
  const landed = own.filter((act) => act.state === "landed").length;
  const may = own.filter((act) => act.state === "may_have_landed").length;
  const earlier = result.acts.length - own.length;
  const parts = [
    ...(result.rows !== undefined ? [rowsWord(result.rows.totalRows)] : result.answerText !== undefined ? ["an answer in the model's words"] : []),
    ...(landed > 0 ? [`${thingsWord(landed)} done on the site`] : []),
    ...(may > 0 ? [`${thingsWord(may)} that may have happened on the site`] : []),
    ...(earlier > 0 ? [`${thingsWord(earlier)} already done earlier`] : [])
  ];
  if (parts.length === 0) return result.acts.length > 0 ? "nothing that changed the site" : "work done on the site";
  return parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
