// The pages a result's rows were read from, as the judge is shown them (`./types.ts`, `readPages`).
//
// A result made of a run's rows can come from several pages while the end view is the one page the run
// left, so a judge shown only that page said "unknown" of rows it could not place (run-mwa19obz-abd5d558,
// judge 0032: "the only page shown is page 3 ... pages 1 and 2 are not shown", the rows having been read
// from them). Core already holds where each read read and how many rows it kept (the row sink's pages);
// this says them, one entry each, bounded, with no page text. An address that a screen drops is withheld
// here, and the summary is then marked withheld, as a screened `looked` line is.

import type { AutomationStudioFlowLessSummary } from "./types.ts";

/** The latest reads shown, and how much of an address and a place. */
const READS_SHOWN = 40;
const WHERE_CHARS = 300;
const PLACE_CHARS = 80;

export type AutomationStudioFlowLessReadPagesShown = { pages: { where?: string; place?: string; kept: number }[]; notShown?: number; withheld: boolean };

/** The reads of a result made of rows, each as one entry; none for a result with no rows or no read that said where. */
export function automationStudioFlowLessReadPagesShown(summary: Pick<AutomationStudioFlowLessSummary, "rows" | "readPages">, screen: (text: string) => { text: string; withheld: boolean }): AutomationStudioFlowLessReadPagesShown {
  const reads = summary.rows ? summary.readPages ?? [] : [];
  let withheld = false;
  const line = (text: string, most: number): string => {
    const screened = screen(cut(text, most));
    if (screened.withheld) withheld = true;
    return screened.text;
  };
  const shown = reads.slice(-READS_SHOWN).map((read) => ({
    ...(read.where ? { where: line(read.where, WHERE_CHARS) } : {}),
    ...(read.place ? { place: line(read.place, PLACE_CHARS) } : {}),
    kept: Number.isSafeInteger(read.kept) && read.kept >= 0 ? read.kept : 0
  }));
  return { pages: shown, ...(reads.length > shown.length ? { notShown: reads.length - shown.length } : {}), withheld };
}

/** At most `most` characters, by code point, with `…` where it was cut. */
function cut(text: string, most: number): string {
  const characters = [...text];
  return characters.length <= most ? text : `${characters.slice(0, most - 1).join("")}…`;
}
