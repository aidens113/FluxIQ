// What a list holds after another read of it: the one rule for a re-read and a next page.
//
// **The result is what the model's latest read of the list says, in that order; rows from different
// pages of one list still merge.** So a read either carries on the list (the next page, or the same
// page read again with nothing moved), or starts it over. Taken in this order:
//
//   1. It read a page the list holds again, row for row in the same order: it carries on, and new
//      values replace old ones in place. Other pages stand, since nothing says they moved.
//   2. The address shows another view of the site and the model did not say `append`: over.
//   3. The call or the address says which page: a page the list has not held is the next page,
//      whatever its rows repeat, and a page it has held, with its rows moved, is over. (A first read
//      that named no page is taken as the first page, unless the rows then share nothing, as on a
//      site counting from nought.)
//   4. The model said `replace`: over.
//   5. The rows: none known is the next page. All known, in any other order or fewer, is a sort or
//      a filter: over. Some known is a next page where the read takes up where the list ended (a
//      window on a feed); a read that holds every row the list holds, and more, out of the list's
//      order, is the list read whole again: over, which loses nothing it held; otherwise a next page
//      where they are under half of it (a feed repeating a row), and over where they are not.
//
// **A short list read whole again is not its next page (run-mwa19obz-abd5d558).** A rerun of a saved
// Flow read an unsorted list where the sort had not been pressed, and two rows matched; the list
// started over on them. The next run sorted it and read all ten, those two among them, under the
// Flow's own `append`: two known of ten is under half, so the ten were taken as the next page and
// put after the two, and a judge refused the result twice as out of the order asked. Every row the
// list held was in the read, so the read was the list again, not a page beyond it.
//
// **Two pages, then the first read again sorted differently, is over: the result is that one page,
// with the rest gone.** A sort moves rows between pages, so the old second page has no place in the
// new order, and keeping it would hold rows a filter removed, with no way for the model to clear
// them. Starting over can always get back: reading the next page merges after it, and a judge who
// sees the result short says so. The other way cannot. What a person sees of this is
// `fewerThanEarlier` (`./rows-summary.ts`).
//
// A read with no rows is no read of the list: the sink never brings it here. A page the sink kept as
// read and empty (`./row-sink.ts`) holds no row, so it is passed by: it says nothing of where a read
// is, and a read with rows at its place takes its place.
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioAnswerFirstListPage } from "./list-page.ts";
import type { AutomationStudioAnswerFirstReadEvidence } from "./read-evidence-type.ts";
import { automationStudioAnswerFirstRowTies } from "./row-ties.ts";

/** A page word's value that may name the first page of a list whose first read named none. */
const FIRST_PLACE = /=[01]$/u;

export function automationStudioAnswerFirstListAfterRead(input: {
  pages: readonly AutomationStudioAnswerFirstListPage[];
  /** The list as it stands: its pages merged. */
  held: readonly JsonObject[];
  /** This read's rows, none repeated whole. */
  read: readonly JsonObject[];
  columns: readonly string[];
  evidence: Pick<AutomationStudioAnswerFirstReadEvidence, "place" | "says" | "list" | "leftOut">;
  /** The read was of another view than the list's last. */
  moved: boolean;
}): { over: boolean; pages: AutomationStudioAnswerFirstListPage[]; rows: JsonObject[] } {
  const { pages, held, read, columns, evidence, moved } = input;
  // What the read left out stays with the page it read, whichever way the list goes on (`./row-sink.ts`, `readPages`).
  const own: AutomationStudioAnswerFirstListPage = { rows: [...read], ...(evidence.place !== undefined ? { place: evidence.place } : {}), ...(evidence.list !== undefined ? { where: evidence.list } : {}), ...(evidence.leftOut ? { leftOut: evidence.leftOut } : {}) };
  const ties = automationStudioAnswerFirstRowTies(held, read, columns);
  const known = ties.filter((tie) => tie !== undefined).length;
  const same = pages.findIndex((page) => page.rows.length === read.length && automationStudioAnswerFirstRowTies(page.rows, read, columns).every((tie, at) => tie === at));
  if (!carriesOn({ same: same >= 0, known, read: read.length, ties, held: held.length, moved, evidence, pages })) return { over: true, pages: [own], rows: [...read] };
  const rows = [...held];
  read.forEach((row, at) => {
    const tie = ties[at];
    if (tie === undefined) rows.push(row);
    else rows[tie] = row;
  });
  return { over: false, pages: same >= 0 ? pages.map((page, at) => (at === same ? own : page)) : [...pages.filter((page) => page.rows.length > 0 || page.place !== own.place), own], rows };
}

function carriesOn(input: { same: boolean; known: number; read: number; ties: readonly (number | undefined)[]; held: number; moved: boolean; evidence: Pick<AutomationStudioAnswerFirstReadEvidence, "place" | "says">; pages: readonly AutomationStudioAnswerFirstListPage[] }): boolean {
  const { place, says } = input.evidence;
  if (input.same) return true;
  if (input.moved && says !== "append") return false;
  if (place !== undefined) {
    if (input.pages.some((page) => page.place === place && page.rows.length > 0)) return false;
    return !(FIRST_PLACE.test(place) && input.pages.some((page) => page.place === undefined)) || input.known === 0;
  }
  if (says === "replace") return false;
  if (input.known === 0) return true;
  if (input.known === input.read) return false;
  if (takesUpWhereItEnded(input.ties, input.held)) return true;
  if (holdsEveryRow(input.ties, input.held)) return false;
  return input.known * 2 < input.read;
}

/** Every row the list holds is one of the read's (header, 5). */
function holdsEveryRow(ties: readonly (number | undefined)[], held: number): boolean {
  return held > 0 && new Set(ties.filter((tie) => tie !== undefined)).size === held;
}

/** The read begins with the list's last rows, in order, and then only new ones. */
function takesUpWhereItEnded(ties: readonly (number | undefined)[], held: number): boolean {
  const first = ties.findIndex((tie) => tie === undefined);
  return first > 0 && ties.slice(0, first).every((tie, at) => tie === held - first + at) && ties.slice(first).every((tie) => tie === undefined);
}
