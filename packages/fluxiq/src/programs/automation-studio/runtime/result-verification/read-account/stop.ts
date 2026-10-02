// What stopped a read's paging, as one of three things a reader acts on
// differently: the list ended, the step's own page bound stopped it, or
// something else did.
//
// The words are the domain's (`paginationStop`, admitted on the attempt by
// `service/summaries/extraction-summary.ts`). The list ends a read with
// `control_disabled`, `no_following_page`, `control_absent` or
// `scrolled_to_end`; the page bound with `page_limit`. A read that said no word
// ended with the list when it read fewer pages than its bound allowed, and was
// stopped by the bound when it read all of them and reports itself truncated.
// Every other word -- the server refusing, the deadline, an item bound, a page
// that misbehaved -- is neither, and is said as its word.
//
// `run-muq66ff9-cb3767a1` is why this is decided once, here: a list whose Next
// was disabled on page 5 of a 5-page bound was read by the judge as the bound,
// and every re-author was sent to raise it.

import type { AutomationStudioResultReadAccount } from "../contracts.ts";

/** Why a read's paging stopped, as what a reader does about it. */
export type AutomationStudioResultReadStopMeaning = "list_ended" | "page_bound" | "other";

/** The stop words with which the list itself ends a read. */
const LIST_ENDED: ReadonlySet<string> = new Set(["control_disabled", "no_following_page", "control_absent", "scrolled_to_end"]);

/** What stopped this read's paging. */
export function automationStudioResultReadStop(read: Pick<AutomationStudioResultReadAccount, "pagesRead" | "pageLimit" | "stop" | "truncated">): AutomationStudioResultReadStopMeaning {
  if (read.stop === "page_limit") return "page_bound";
  if (read.stop !== undefined) return LIST_ENDED.has(read.stop) ? "list_ended" : "other";
  if (read.pageLimit === undefined) return "other";
  if (read.pagesRead < read.pageLimit && !read.truncated) return "list_ended";
  return read.pagesRead >= read.pageLimit && read.truncated ? "page_bound" : "other";
}
