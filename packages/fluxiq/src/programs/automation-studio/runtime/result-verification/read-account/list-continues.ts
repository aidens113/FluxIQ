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
// (`service/candidate-trial/feedback.ts`) both say it, and so do the judges'
// words for the read (`./judge-paging.ts`, `./sentence.ts`), so judge and
// builder see one account.
//
// A feed the page declares, or a list with no way on, is said to go on only
// where the read's own reveal ran out while it was still growing: one that
// stopped growing showed its end, and the read sends nothing for it.
//
// A read that pages, or ran as the passes of a loop, is left to its paging
// account (`./stop.ts`, `./judge-paging.ts`), which already says how its list
// ended. Generic words only: no site's, task's or list's terms.
//
// **Going on is not rows missing from the range asked for (t741 D).** Social
// rerun round 3 (`run-mvgoawg4-ed85dd5a`, 0141-0145, 0214-0218): a feed's read
// was told it "was still growing when the read stopped revealing more of it",
// which was true -- the list went on past the page's own end marker into units
// of another kind -- and the judges read that as rows missing from the task's
// range and asked to page further, while one of them said the end marker was
// reached. A list that grows as it is revealed (a feed the page declares, one
// seen still growing, one that loads as it is scrolled) now says that going on
// past an end the page marks, or past the range the request asks for, is not
// rows missing from that range, and the fix line says to leave such a read as
// it is. A list whose next part the page names by a number or a control says
// what it said; the judges' prose says the same for every list
// (`../../llm/diagnosis-instructions.ts`).
//
// **Closed replies are coverage too (t762).** Items that each carry a control
// opening more of the list -- "View 3 replies" -- hold rows the read, which
// reads what is on the page, never saw. The read carries `unopened_replies`; the
// sentence says those controls were not opened and the fix line says to open
// them before reading, not to page the list on.
//
// **A list goes on, ends, or is paused by the site (t755).** A list whose
// loader answered the read's reveal with a notice to wait before it loads more
// grew no further, and until 2026-10-27 read as one that had ended: a read of
// the first screens of a longer list said nothing of the rest while the page
// asked to wait under it. Such a read now carries `loader_asked_to_wait`; its
// sentence says the list paused rather than ended, and its fix line says each
// move to the next part waits out the page's pause first. An ended list still
// sends nothing: a step that moves the list on says when it has ended (its
// `ended` answer), and that is where a loop learns it.

import type { AutomationStudioResultReadAccount } from "../contracts/index.ts";

/** What Core says of a read of one part of a list that goes on past it, and the fix line that follows, or `undefined` for any other read. */
export function automationStudioResultReadListContinues(read: AutomationStudioResultReadAccount): { said: string; fix: string } | undefined {
  const fact = read.listContinues;
  if (!fact || read.paginates === true || read.keptPerPage !== undefined || read.pagesRead > 1 || read.stop !== undefined) return undefined;
  const seen = read.itemsSeen !== undefined ? `saw ${read.itemsSeen} ${read.itemsSeen === 1 ? "item" : "items"} and kept ${read.kept}` : `kept ${read.kept}`;
  if (fact.evidence === "unopened_replies") return unopened(read.nodeId, seen);
  return {
    said: `Step ${read.nodeId} read one part of a list that goes on past it (${shownBy(fact)}): it ${seen}, and no item after those was read.${grows(fact) ? ` ${PAST_THE_RANGE}` : ""}`,
    fix: `To read past what step ${read.nodeId} read, move that same list on to its next part (${wayOn(fact.kind)}) and repeat the read after each move, in a loop, until the list ends or holds what the request asks for.${paused(fact) ? ` ${PAUSED_FIX}` : ""} Where the request asks only for what its first part shows, or what was read already reaches an end the page itself marks or the end of the range the request asks for, leave the read as it is.`
  };
}

/** Closed controls that open more of the list: what those hold was not read, and they are opened before the read (header, t762). */
function unopened(nodeId: string, seen: string): { said: string; fix: string } {
  return {
    said: `Step ${nodeId} read the list as the page showed it: it ${seen}, and its items carry controls that open more of the list (replies) which were not opened, so what those controls hold was not read.`,
    fix: `To read what those controls hold, open them before step ${nodeId} reads: press each item's control that opens its replies, as a person would, and read the list again once they are open. Where the request asks only for the items the page shows without opening anything, leave the read as it is.`
  };
}

/** That a list going on past its own end, or past the range asked for, is not rows missing from that range (header, t741 D). */
const PAST_THE_RANGE = "Where it goes on past an end the page itself marks, or past the range the request asks for, what follows is not rows missing from that range: judge what was read against the request's own range.";

/** That a paused list is moved on only once the page's own pause is over (header, t755). */
const PAUSED_FIX = "The page paused this list: before each move, wait as long as its notice asks, or press the retry control the notice offers once it shows, as a person would.";

/** Whether the list's loader asked to wait, rather than the list ending (header, t755). */
function paused(fact: { evidence: string }): boolean {
  return fact.evidence === "loader_asked_to_wait";
}

/** Whether the list grows as it is revealed, rather than naming its next part by a number or a control (header, t741 D). */
function grows(fact: { kind: string; evidence: string }): boolean {
  return fact.evidence === "declared_feed" || fact.evidence === "still_growing" || fact.kind === "infinite_scroll";
}

/** What on the page said the list goes on, in plain words. */
function shownBy(fact: { kind: string; evidence: string }): string {
  if (fact.evidence === "following_page_number") return "the page shows a numbered page after the current one";
  if (fact.evidence === "declared_feed") return "the page marks it as a list that loads more as it is scrolled, and it was still growing when the read stopped revealing more of it";
  if (fact.evidence === "still_growing") return "it was still growing when the read stopped revealing more of it";
  if (fact.evidence === "loader_asked_to_wait") return "the page answered the read's reveal of its end with a notice to wait before it loads more, so the list paused there rather than ended";
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
