// A read's account as Core says it, in two lengths.
//
// `brief` is for the run's observation, which becomes the failure record's
// `actual` and is held to that record's 1,024 characters beside the check's own
// reading, so it carries the counts and names no condition. `full` is for the
// re-author's brief, which has room, and says each condition with the rows it
// rejected -- the fact a re-author needs to correct the one that dropped rows
// the request wanted, instead of adding a step that already exists -- and, where
// the read sent them, the rows it removed by itself, by label (`alone-rows.ts`).
//
// **Why paging stopped is said as what it means, not as a closed word beside a
// bound.** `run-muq66ff9-cb3767a1` was told "read 5 pages of at most 5, paging
// stopped on control_disabled": a list whose Next was disabled on its last page.
// The judge read "5 of at most 5" as the bound and advised raising maxPages, and
// every re-author after it chased a bound that had read every page there was.
// So a read the list ended (`stop.ts`) is said as having read every page, with
// no bound beside it; only a read the page bound stopped is told the list may
// go on and how to read further. Information only: nothing here refuses.
//
// **A read that moves page by page is never said not to deduplicate.** It
// leaves out a row identical to one an earlier page yielded, dedupe or none, and
// `run-muqk713g`'s judges, told "It does not deduplicate." of one that had left
// out two such rows, all asked for the dedupe it already did. So such a read is
// said to leave them out, with its count where it sent one.

import type { AutomationStudioResultReadAccount } from "../contracts.ts";
import { automationStudioResultReadStop } from "./stop.ts";

/** Core's sentence for how one read went. */
export function automationStudioResultReadSentence(read: AutomationStudioResultReadAccount, length: "brief" | "full"): string {
  const seen = read.itemsSeen !== undefined ? ` of ${read.itemsSeen} items seen` : "";
  const attempts = read.attempts ? ` (the last of ${read.attempts} reads of this step)` : "";
  const head = `step ${read.nodeId} read ${pagesClause(read)} and kept ${read.kept}${seen}${attempts}`;
  return length === "brief" ? `${head}${briefTail(read)}` : `${capitalized(head)}.${fullTail(read)}`;
}

/** The pages read and why paging stopped, as what the stop means. */
function pagesClause(read: AutomationStudioResultReadAccount): string {
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

function briefTail(read: AutomationStudioResultReadAccount): string {
  const parts: string[] = [];
  if (read.paginates === true) parts.push("it pages");
  if (read.dedupes === true) parts.push(read.dedupeBy?.length ? `keeps one row per ${read.dedupeBy.join(" + ")}` : "dedupes");
  if (read.dropsEarlierPageRepeats) {
    const repeats = read.earlierPageRepeats;
    parts.push(repeats === undefined ? "leaves out rows repeating an earlier page's" : `left out ${repeats} ${repeats === 1 ? "row" : "rows"} repeating an earlier page's`);
  }
  const counts = (read.conditions ?? []).map((condition) => condition.rejected);
  if (counts.length) {
    const alone = (read.conditions ?? []).map((condition) => condition.alone);
    const byItself = alone.some((rows) => rows !== undefined) ? ` (by itself: ${alone.map((rows) => rows ?? "?").join(", ")})` : "";
    parts.push(`its ${counts.length} ${counts.length === 1 ? "condition" : "conditions"} rejected ${counts.map((rows) => rows ?? "?").join(", ")} rows${byItself}`);
  }
  if (read.unfiltered) parts.push("every row failed them, so it answered unfiltered");
  return parts.length ? `; ${parts.join(", ")}` : "";
}

function fullTail(read: AutomationStudioResultReadAccount): string {
  const lines: string[] = [];
  const stop = automationStudioResultReadStop(read);
  if (read.paginates === true) {
    lines.push(stop === "list_ended"
      ? "It already follows pages and read to the end of the list, so a higher page bound would read nothing more; do not add a paging step around it."
      : "It already follows pages; do not add a paging step around it -- change its own paging setting if more pages are needed.");
  }
  if (read.paginates === false) lines.push("It does not follow pages.");
  if (stop === "page_bound") {
    lines.push(`Its page bound stopped it${read.pageLimit !== undefined ? ` at ${read.pageLimit}` : ""}, not the list, so the list may go on: raise its maxPages (maxScrolls for a read that scrolls) if the request needs rows past page ${read.pagesRead}.`);
  }
  if (read.dedupes === true) lines.push(`It already keeps one row per ${read.dedupeBy?.length ? read.dedupeBy.join(" + ") : "row identity"}.`);
  if (read.dropsEarlierPageRepeats) lines.push(earlierPageRepeats(read));
  else if (read.dedupes === false) lines.push("It does not deduplicate.");
  const conditions = read.conditions ?? [];
  if (conditions.length) {
    const said = conditions.map((condition, index) => `${condition.condition ?? `condition ${index + 1} (wording withheld)`} rejected ${condition.rejected ?? "an unreported number of"} rows${condition.alone === undefined ? "" : `, ${condition.alone} of them by itself`}${leftOutOnlyByThis(condition.leftOutOnlyByThis)}`);
    lines.push(`Its conditions, each with the rows it rejected across the whole read (a row can fail more than one): ${said.join("; ")}.`);
    // The rows a condition removed by itself passed every other condition: if the answer lacks rows the request wanted, they are where they went.
    if (conditions.some((condition) => (condition.alone ?? 0) > 0)) {
      lines.push("A row a condition rejected by itself passed every other condition, so if the answer lacks rows the request wanted, a condition with such rows is the first to check against the request's own words.");
    }
  }
  if (read.unfiltered) lines.push("Every row failed its conditions, so it answered with the unfiltered rows.");
  return lines.length ? ` ${lines.join(" ")}` : "";
}

/**
 * What a read that moves page by page does with a row an earlier page already
 * yielded, and how many it left out, for the read that sent the count. Said in
 * place of "It does not deduplicate.", which `run-muqk713g`'s judges were told
 * of such a read and answered by asking for a dedupe it already did.
 */
function earlierPageRepeats(read: AutomationStudioResultReadAccount): string {
  const repeats = read.earlierPageRepeats;
  const kept = read.conditions?.length ? " its conditions had kept" : "";
  const counted = repeats === undefined
    ? "it left out an unreported number of such rows."
    : `it left out ${repeats} such ${repeats === 1 ? "row" : "rows"}${kept}.`;
  const what = "a row identical, field for field, to one an earlier page yielded";
  if (read.dedupes === false) {
    return `It names no dedupe, but as a read that moves page by page it already leaves out ${what}: ${counted} So the answer never holds such a row twice; a dedupe would only also merge rows that share its key and differ in another column.`;
  }
  return `As a read that moves page by page, it ${read.dedupes === true ? "also " : ""}leaves out ${what}: ${counted}`;
}

/** The rows a condition removed by itself, named, each label quoted whole; nothing when the read did not send them. */
function leftOutOnlyByThis(labels: readonly string[] | undefined): string {
  return labels?.length ? ` (removed by itself: ${labels.map((label) => JSON.stringify(label)).join(", ")})` : "";
}

function pageCount(pages: number): string {
  return `${pages} ${pages === 1 ? "page" : "pages"}`;
}

function capitalized(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}
