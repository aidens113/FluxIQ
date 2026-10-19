// Core's words for a read of one part of a list that goes on past it (F8).
//
// A read that was not asked to page reads one part of its list, by design: a
// loop's later passes collect the rest. Its counts cannot say that the list
// went on, and live run `run-mveaaqxn-d0be9888` paid for that: a trial's read
// saw 5 items of a longer list and kept 1, the judges said it never went past
// the first part, and the builder, told only `result.counts_look_right`, kept
// the read as it was for three revisions. The read now says, as a fact it saw
// on the page, how its list goes on (`listContinues` on the account, admitted
// by `service/summaries/extraction-summary.ts`), and this is the one sentence
// for it: the finding (`../repair-directive.ts`) and the trial's feedback
// (`service/candidate-trial/feedback.ts`) both say it, so they cannot disagree.
//
// A read that pages, or ran as the passes of a loop, is left to its paging
// account (`./stop.ts`, `./judge-paging.ts`), which already says how its list
// ended. Generic words only: no site's, task's or list's terms.

import type { AutomationStudioResultReadAccount } from "../contracts/index.ts";

/** What Core says of a read of one part of a list that goes on past it, and the fix line that follows, or `undefined` for any other read. */
export function automationStudioResultReadListContinues(read: AutomationStudioResultReadAccount): { said: string; fix: string } | undefined {
  const fact = read.listContinues;
  if (!fact || read.paginates === true || read.keptPerPage !== undefined || read.pagesRead > 1 || read.stop !== undefined) return undefined;
  const seen = read.itemsSeen !== undefined ? `saw ${read.itemsSeen} ${read.itemsSeen === 1 ? "item" : "items"} and kept ${read.kept}` : `kept ${read.kept}`;
  return {
    said: `Step ${read.nodeId} read one part of a list that goes on past it (${shownBy(fact)}): it ${seen}, and no item after those was read.`,
    fix: `To read past what step ${read.nodeId} read, move that same list on to its next part (${wayOn(fact.kind)}) and repeat the read after each move, in a loop, until the list ends or holds what the request asks for. Where the request asks only for what its first part shows, leave the read as it is.`
  };
}

/** What on the page said the list goes on, in plain words. */
function shownBy(fact: { kind: string; evidence: string }): string {
  if (fact.evidence === "following_page_number") return "the page shows a numbered page after the current one";
  if (fact.kind === "next_page") return "the page shows a control to its next page";
  if (fact.kind === "load_more") return "the page shows a control that loads more of it";
  if (fact.kind === "infinite_scroll") return "the page marks it as a list that loads more as it is scrolled";
  return "the page shows it goes on";
}

/** How the list is moved on to its next part, in plain words. */
function wayOn(kind: string): string {
  if (kind === "next_page") return "its next page";
  if (kind === "load_more") return "its load-more control";
  if (kind === "infinite_scroll") return "a scroll down it";
  return "its next page, its load-more control or a scroll down it";
}
