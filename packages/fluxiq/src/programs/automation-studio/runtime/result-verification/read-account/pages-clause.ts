// The shared paging clause, read from the existing raw stop classification.
import type { AutomationStudioResultReadAccount } from "../contracts.ts";
import { automationStudioResultReadStop } from "./stop.ts";

/** The pages read and why paging stopped, as what the stop means. */
export function automationStudioResultReadPagesClause(read: AutomationStudioResultReadAccount): string {
  const pages = pageCount(read.pagesRead);
  const stop = automationStudioResultReadStop(read);
  const cut = read.truncated ? ", cut short by a limit" : "";
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
