// The judge readings of A8 bigbox `run-mv9dcztz-f16d6b5a` steps 0067-0080
// (t629), in the words of the library run of `./library-fixture.ts`: nos
// calling the titles a condition testing the request's own words left out
// "missing", one giving them the very text the condition looks for, one naming
// a title whose value the read never found, and the yes. No task, site, item
// or answer of any realistic scenario.
import { AVAILABLE_TODAY, BOOK_ABBEY, BOOK_FOG, BOOK_LARKSPUR, BOOK_LEDGER } from "./library-fixture.ts";

const EXPECTED = "Every mystery novel available to borrow today and rated 4 or higher, from every page, each title once, without audiobook editions.";

/** Step 0068's no: the settled titles called "missing qualifying rows", the condition called too literal. */
export const MISSING_QUALIFYING_NO = {
  expected: EXPECTED,
  observed: `Stored 3 rows; missing qualifying rows including ${BOOK_FOG} (4.5, available tomorrow), ${BOOK_LEDGER} (4.6, on hold until Monday), ${BOOK_ABBEY} (4.7, available tomorrow). Condition 2 (${AVAILABLE_TODAY}) left these out.`,
  changed: "Relax condition 2 so it accepts the library's lending availability rather than the literal \"Available to borrow today\" string."
};

/** Step 0071's no: "Missing qualifying rows:", then the condition named. */
export const MISSING_LIST_NO = {
  expected: EXPECTED,
  observed: `3 rows stored. Missing qualifying rows: ${BOOK_FOG}; ${BOOK_LEDGER}; ${BOOK_ABBEY}. Condition 2 (${AVAILABLE_TODAY}) left them out.`,
  changed: "Relax condition 2 so it keeps titles whose availability means today rather than requiring the exact text."
};

/** Step 0072's no: the condition said to have dropped rows "including" two settled titles. */
export const DROPPED_INCLUDING_NO = {
  expected: EXPECTED,
  observed: `Stored 3 rows; condition 2 (${AVAILABLE_TODAY}) dropped 3 rows including ${BOOK_FOG} (4.5, Available tomorrow) and ${BOOK_ABBEY} (4.7, Available tomorrow), although the request only requires that the title can be borrowed today.`,
  changed: "Change condition 2 to a test that keeps every title the library can lend today."
};

/** Step 0080's no: two settled titles written with the very text the condition looks for. */
export const VALUE_SAID_NO = {
  expected: EXPECTED,
  observed: `3 rows stored; missing ${BOOK_FOG} (4.5, Available to borrow today) and ${BOOK_ABBEY} (4.7, Available to borrow today), both satisfying the request but dropped by condition 2 (${AVAILABLE_TODAY}) despite their availability value being "Available to borrow today".`,
  changed: "Fix condition 2 so it keeps the titles whose availability is \"Available to borrow today\"."
};

/** A no naming a title the read left out whose value Core never read: a defect Core cannot refute. */
export const UNREAD_TITLE_NO = {
  expected: EXPECTED,
  observed: `3 rows stored. Missing qualifying rows: ${BOOK_LARKSPUR} (4.8, available to borrow today), which condition 2 (${AVAILABLE_TODAY}) dropped although its availability says it.`,
  changed: "Fix condition 2's read so it finds the availability of every title."
};

/** The yes: each settled condition held to the request's own words, once. */
export const LIBRARY_YES = {
  answersRequest: "yes",
  expected: EXPECTED,
  observed: `Condition 1 (rating atLeast 4) follows "rated 4 or higher". Condition 2 (${AVAILABLE_TODAY}) follows "available to borrow today". The 3 stored titles meet both.`
};
