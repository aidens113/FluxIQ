// Paging wording on the judge's copy only. Raw read accounts, including their
// authored limits and contradictory observations, remain available unchanged.
//
// The judge's copy also drops each condition's `testedLabel` (live run
// `run-mux6naez-6c20f26e`, `./without-tested-label.ts`): it is Core's own
// bookkeeping for which rows `../request-rows/` may flag, and no judge
// instruction describes it. So the flagged rows are found before this copy is
// made (`../verify.ts`).
import type { AutomationStudioResultReadAccount, AutomationStudioRunResultSummary } from "../contracts.ts";
import { automationStudioResultReadPageBoundSentence, automationStudioResultReadPagesClause, automationStudioResultReadStop } from "./index.ts";
import { automationStudioResultSummaryWithoutTestedLabel } from "./without-tested-label.ts";

/** Add paging words without turning uncertain stop evidence into completeness, and drop each condition's `testedLabel`. */
export function automationStudioResultSummaryWithPagingWords(summary: AutomationStudioRunResultSummary): AutomationStudioRunResultSummary {
  if (!summary.reads?.length) return summary;
  const shown = automationStudioResultSummaryWithoutTestedLabel(summary);
  return { ...shown, reads: (shown.reads ?? []).map(forJudge) };
}

function forJudge(read: AutomationStudioResultReadAccount): AutomationStudioResultReadAccount & { paging: string } {
  const meaning = automationStudioResultReadStop(read);
  // A looped read's bound counts its loop's passes, not its pages.
  const reach = read.keptPerPage?.length ?? read.pagesRead;
  const countsAgree = Number.isSafeInteger(read.pagesRead) && read.pagesRead > 0
    && (read.pageLimit === undefined || (Number.isSafeInteger(read.pageLimit) && read.pageLimit >= reach));
  // An absent stop is not an observed end. A first-page absent control can also
  // be a control that names nothing, as the shared sentence already explains.
  const observedEnd = meaning === "list_ended" && read.stop !== undefined && !read.truncated
    && countsAgree && read.paginates !== false && !(read.stop === "control_absent" && read.pagesRead === 1);
  if (observedEnd) {
    const { pageLimit: _bound, ...rest } = read;
    return { ...rest, paging: `Read ${automationStudioResultReadPagesClause(read)}. There is no further page.` };
  }
  if (!countsAgree || meaning === "list_ended") {
    const reason = !countsAgree ? "The recorded paging counts conflict."
      : read.truncated ? "The read reports truncation alongside an end-of-list stop."
      : read.stop === undefined ? "No paging stop was recorded."
      : read.paginates === false ? "The read was not authored to follow pages."
      : "No next control was found on the first page; that control may not identify the pager.";
    return { ...read, paging: `Read ${read.pagesRead} ${read.pagesRead === 1 ? "page" : "pages"}. ${reason} Whether the list ended is uncertain.` };
  }
  const said = `Read ${automationStudioResultReadPagesClause(read)}.`;
  return { ...read, paging: meaning === "page_bound" ? `${said} ${automationStudioResultReadPageBoundSentence(read)}` : said };
}
