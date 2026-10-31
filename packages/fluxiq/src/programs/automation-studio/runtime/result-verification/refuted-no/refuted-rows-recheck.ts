// What a no whose every defect row Core's record of that row refutes is asked
// once more (t810, framework plan P5b, `../agreement/unsupported-no.ts`).
//
// Run `run-mvud43a2-445c7f17`: two calls said no on byte-identical requests at
// temperature 0, and the generic re-ask of a no Core could not ground asked
// them the same question again; both said no again. Asking the same question
// of the same evidence twice is one opinion counted twice. This recheck is a
// different question:
//
// - It quotes Core's evidence for each refuted row (`refutedRows`): the words
//   the item showed the person, an offer to enter a set the person is not in
//   (`outside_mark`), or the row's own cell in the column the no named
//   (`cell_differs`), or the condition that left out a row the no called kept
//   (`not_kept`).
// - It lists the rows in the reverse of the order the no gave them, so the
//   judge does not walk its own reading again.
// - It asks the converse, as a confirming check does (`../agreement/ask-again.ts`,
//   t691): start from those rows, not from the request, and say for each
//   whether the request's own words ask for it as Core's record shows it.
//
// Core's words, naming no site, task or kind of set; the rows and quotes are
// the evidence's, after a marker.

/** One row a no named that Core's record of it refutes: the row as the no named it, the value it claimed, and Core's evidence. */
export type AutomationStudioResultRefutedRowRecheckRow = {
  row: string;
  evidence: "outside_mark" | "cell_differs" | "not_kept";
  /** Core's quote of its evidence: the mark's words (and what it is for), `column: "cell"`, or `left out by condition N (wording)`. */
  quote: string;
  /** The value the no claimed for the row, where it named one. */
  value?: string | undefined;
};

/** What the recheck asks, said above the rows (header). */
const ASKED = "This same evidence was judged before, and that answer said the result does not answer the request because of the rows it named. "
  + "Core's own record of each of those rows contradicts what that answer said of it, as listed below after the marker. "
  + "This time start from those rows, not from the request: for each row below, say whether the request's own words ask for that row in its answer, as Core's record shows it, quoting in double quotes the words that ask for it or leave it out. "
  + "An item that showed the person an offer to enter a set is one the person is not in. "
  + "Answer no only for a defect of this result that Core's record of its row does not contradict, listed in defects with the row named as the evidence names it, the column and that row's own value in it, and the request's own words it fails. "
  + "Where no such defect remains, answer yes, and name each row the result left out with the request's words that leave it out.";

/** The recheck for one call's refuted no (header): its rows in the reverse of the order the no gave them. */
export function automationStudioResultRefutedRowsRecheck(rows: readonly AutomationStudioResultRefutedRowRecheckRow[]): string {
  const lines = [...rows].reverse().map((one) => one.evidence === "outside_mark"
    ? `- "${one.row}": its item showed the person ${one.quote}.`
    : one.evidence === "not_kept"
      ? `- "${one.row}": the result does not hold it; it was ${one.quote}.`
      : `- "${one.row}": its own cell is ${one.quote}${one.value !== undefined ? `, not "${one.value}"` : ""}.`);
  return [ASKED, "Core's record of those rows:", ...lines].join("\n");
}
