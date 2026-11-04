// The headline of a result, and a short account of what it holds, in words. A count comes
// from the rows' own total; "of" is said only of a confirmed result.

import type { ChatTaskResult } from "../../ports/index.ts";
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

/** What an unfinished result holds, for "What I got: ...". */
export function gotSummary(result: ChatTaskResult): string {
  if (result.rows !== undefined) return rowsWord(result.rows.totalRows);
  if (result.answerText !== undefined) return "an answer in the model's words";
  return "work done on the site";
}
