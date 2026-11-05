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
//      window on a feed), or where they are under half of it (a feed repeating a row); otherwise over.
//
// **Two pages, then the first read again sorted differently, is over: the result is that one page,
// with the rest gone.** A sort moves rows between pages, so the old second page has no place in the
// new order, and keeping it would hold rows a filter removed, with no way for the model to clear
// them. Starting over can always get back: reading the next page merges after it, and a judge who
// sees the result short says so. The other way cannot. What a person sees of this is
// `fewerThanEarlier` (`./rows-summary.ts`).
//
// A read with no rows is no read of the list: the sink never brings it here.
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
  evidence: Pick<AutomationStudioAnswerFirstReadEvidence, "place" | "says">;
  /** The read was of another view than the list's last. */
  moved: boolean;
}): { over: boolean; pages: AutomationStudioAnswerFirstListPage[]; rows: JsonObject[] } {
  const { pages, held, read, columns, evidence, moved } = input;
  const own: AutomationStudioAnswerFirstListPage = { rows: [...read], ...(evidence.place !== undefined ? { place: evidence.place } : {}) };
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
  return { over: false, pages: same >= 0 ? pages.map((page, at) => (at === same ? own : page)) : [...pages, own], rows };
}

function carriesOn(input: { same: boolean; known: number; read: number; ties: readonly (number | undefined)[]; held: number; moved: boolean; evidence: Pick<AutomationStudioAnswerFirstReadEvidence, "place" | "says">; pages: readonly AutomationStudioAnswerFirstListPage[] }): boolean {
  const { place, says } = input.evidence;
  if (input.same) return true;
  if (input.moved && says !== "append") return false;
  if (place !== undefined) {
    if (input.pages.some((page) => page.place === place)) return false;
    return !(FIRST_PLACE.test(place) && input.pages.some((page) => page.place === undefined)) || input.known === 0;
  }
  if (says === "replace") return false;
  if (input.known === 0) return true;
  if (input.known === input.read) return false;
  return takesUpWhereItEnded(input.ties, input.held) || input.known * 2 < input.read;
}

/** The read begins with the list's last rows, in order, and then only new ones. */
function takesUpWhereItEnded(ties: readonly (number | undefined)[], held: number): boolean {
  const first = ties.findIndex((tie) => tie === undefined);
  return first > 0 && ties.slice(0, first).every((tie, at) => tie === held - first + at) && ties.slice(first).every((tie) => tie === undefined);
}
