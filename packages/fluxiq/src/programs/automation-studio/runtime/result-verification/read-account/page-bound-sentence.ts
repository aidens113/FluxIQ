// The shared advice for a read its authored paging bound stopped.
import type { AutomationStudioResultReadAccount } from "../contracts.ts";

/** The existing page-bound advice, shared with the judge's evidence copy. */
export function automationStudioResultReadPageBoundSentence(read: AutomationStudioResultReadAccount): string {
  // A read looped page by page is bounded by its loop's Repeat, never by a setting of the read's own.
  if (read.keptPerPage) {
    return `The loop's bound stopped it${read.pageLimit !== undefined ? ` at ${read.pageLimit} passes` : ""}, not the list, so the list may go on: raise the most passes (\`most\`) of the Repeat that loops it if the request needs rows past page ${read.pagesRead}.`;
  }
  return `Its page bound stopped it${read.pageLimit !== undefined ? ` at ${read.pageLimit}` : ""}, not the list, so the list may go on: raise its maxPages (maxScrolls for a read that scrolls) if the request needs rows past page ${read.pagesRead}.`;
}
