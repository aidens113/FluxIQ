// The shared paging clause, read from the existing raw stop classification.
// A read whose step ran as the passes of a loop (`keptPerPage`) is said by how
// the loop ended (`loopClause`), in Core's words: no control, no setting of the
// read's own, since the loop is what moved the list on.
import type { AutomationStudioResultReadAccount } from "../contracts.ts";
import { automationStudioResultReadStop } from "./stop.ts";

/** The pages read and why paging stopped, as what the stop means. */
export function automationStudioResultReadPagesClause(read: AutomationStudioResultReadAccount): string {
  const pages = pageCount(read.pagesRead);
  const stop = automationStudioResultReadStop(read);
  const cut = read.truncated ? ", cut short by a limit" : "";
  if (read.keptPerPage) return `${loopClause(read, stop)}${cut}`;
  const ended = (how: string) => `every page (${read.pagesRead}) and the list ended${how}${cut}`;
  if (stop === "list_ended") return ended(listEnd(read));
  if (stop === "page_bound") {
    // Said as before: a read its page bound stopped is the one case "of at most N" describes.
    const bound = read.pageLimit !== undefined ? ` of at most ${read.pageLimit}` : "";
    return `${pages}${bound}${read.stop ? `, paging stopped on ${read.stop}` : ", as many as its page bound allows"}${cut}`;
  }
  // Something other than the list or the page bound stopped it: say the word, and that the bound was not it.
  const before = read.pageLimit !== undefined && read.pagesRead < read.pageLimit ? ` before its page bound of ${read.pageLimit}` : "";
  return `${pages}${read.stop ? `, paging stopped on ${read.stop}${before}` : read.pageLimit !== undefined ? ` of at most ${read.pageLimit}` : ""}${cut}`;
}

/** A looped read's pages, and how its loop ended: the list, the loop's bound, a failed step, or unseen. */
function loopClause(read: AutomationStudioResultReadAccount, stop: ReturnType<typeof automationStudioResultReadStop>): string {
  if (stop === "list_ended") return `every page (${read.pagesRead}) and the list ended: the step that moves it on found no page after page ${read.pagesRead}`;
  const passes = read.keptPerPage?.length ?? 0;
  const over = `${pageCount(read.pagesRead)} over ${passes} ${passes === 1 ? "pass" : "passes"} of its loop`;
  if (stop === "page_bound") return `${over}, until the loop's bound${read.pageLimit !== undefined ? ` of ${read.pageLimit} passes` : ""} stopped it`;
  return read.stop === "failed" ? `${over}, until a step of the loop failed` : over;
}

/** How the list showed it had ended, from the read's own stop word. */
function listEnd(read: AutomationStudioResultReadAccount): string {
  const last = `page ${read.pagesRead}`;
  if (read.stop === "control_disabled") return `: its next control was disabled on ${last}`;
  if (read.stop === "no_following_page") return `: its pager showed no page after ${last}`;
  if (read.stop === "scrolled_to_end") return ": it scrolled to the end of the list";
  if (read.stop === "control_absent") {
    // `control_absent` on the first page is also what a next control that names nothing looks like.
    return read.pagesRead > 1 ? `: no next control was on ${last}` : ": no next control was on the first page, which a next control that names nothing on the page would also show";
  }
  return read.pageLimit !== undefined ? ` before its page bound of ${read.pageLimit}` : "";
}


function pageCount(pages: number): string {
  return `${pages} ${pages === 1 ? "page" : "pages"}`;
}
